import { getPool } from './pool.js';
import { insertNotification } from './notifications.js';

async function getMemberRoleLocal(userId, documentId) {
  const pool = getPool();
  const res = await pool.query(
    `select role from document_members where document_id = $1 and user_id = $2;`,
    [documentId, userId]
  );
  return res.rows[0]?.role || null;
}

async function assertDocumentOwnerLocal(userId, documentId) {
  const pool = getPool();
  const doc = await pool.query(
    `select owner_user_id from documents where id = $1 and archived_at is null`,
    [documentId]
  );
  if (!doc.rows.length) {
    const err = new Error('not_found');
    err.statusCode = 404;
    throw err;
  }
  if (doc.rows[0].owner_user_id !== userId) {
    const err = new Error('forbidden');
    err.statusCode = 403;
    throw err;
  }
}

function clientError(code, message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = code;
  return err;
}

async function loadDocumentRow(documentId) {
  const pool = getPool();
  const res = await pool.query(
    `select id, owner_user_id, title, archived_at from documents where id = $1 limit 1`,
    [documentId]
  );
  return res.rows[0] || null;
}

/**
 * @param {string} documentId
 */
export async function listPendingAccessRequestsForDocument(documentId) {
  const pool = getPool();
  const res = await pool.query(
    `
      select
        r.id,
        r.requester_user_id as "requesterUserId",
        r.requested_role as "requestedRole",
        r.created_at as "createdAt",
        u.email,
        u.name,
        u.avatar_url as "avatarUrl"
      from document_access_requests r
      join users u on u.id = r.requester_user_id
      where r.document_id = $1 and r.status = 'pending'
      order by r.created_at asc;
    `,
    [documentId]
  );
  return res.rows;
}

/**
 * @param {{ requesterUserId: string, documentId: string, requestedRole?: string }} opts
 */
export async function createAccessRequest({ requesterUserId, documentId, requestedRole }) {
  const role = requestedRole === 'viewer' ? 'viewer' : 'editor';
  const doc = await loadDocumentRow(documentId);
  if (!doc || doc.archived_at) {
    const err = new Error('not_found');
    err.statusCode = 404;
    throw err;
  }
  if (doc.owner_user_id === requesterUserId) {
    throw clientError('already_has_access', 'You already own this document.');
  }
  const existingRole = await getMemberRoleLocal(requesterUserId, documentId);
  if (existingRole) {
    throw clientError('already_has_access', 'You already have access to this document.');
  }

  const pool = getPool();
  let requestId;
  try {
    const ins = await pool.query(
      `
        insert into document_access_requests (document_id, requester_user_id, status, requested_role)
        values ($1, $2, 'pending', $3)
        returning id;
      `,
      [documentId, requesterUserId, role]
    );
    requestId = ins.rows[0].id;
  } catch (e) {
    if (e.code === '23505') {
      return { status: 'already_pending' };
    }
    throw e;
  }

  const requesterRes = await pool.query(
    `select coalesce(nullif(trim(name), ''), email, 'Someone') as label from users where id = $1`,
    [requesterUserId]
  );
  const requesterLabel = requesterRes.rows[0]?.label || 'Someone';
  const title = (doc.title && String(doc.title).trim()) || 'Untitled document';

  try {
    await insertNotification({
      userId: doc.owner_user_id,
      type: 'access_request',
      title: `${requesterLabel} requested access`,
      body: `For “${title}”. Open Share on that document to approve or decline.`,
      documentId,
      metadata: { requestId, requesterUserId },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[access-requests] owner notification failed:', e?.message || e);
  }

  return { status: 'created', id: requestId };
}

/**
 * @param {{ ownerUserId: string, documentId: string, requestId: string, decision: 'approve'|'deny' }} opts
 */
export async function resolveAccessRequest({ ownerUserId, documentId, requestId, decision }) {
  await assertDocumentOwnerLocal(ownerUserId, documentId);
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('begin');
    const reqRes = await client.query(
      `
        select id, requester_user_id, requested_role, status
        from document_access_requests
        where id = $1 and document_id = $2
        for update;
      `,
      [requestId, documentId]
    );
    const row = reqRes.rows[0];
    if (!row || row.status !== 'pending') {
      await client.query('rollback');
      const err = new Error('not_found');
      err.statusCode = 404;
      throw err;
    }

    if (decision === 'deny') {
      const requesterUserId = row.requester_user_id;
      await client.query(
        `
          update document_access_requests
          set status = 'denied', resolved_at = now()
          where id = $1;
        `,
        [requestId]
      );
      await client.query('commit');

      const docRow = await pool.query(`select title from documents where id = $1`, [documentId]);
      const docTitle =
        (docRow.rows[0]?.title && String(docRow.rows[0].title).trim()) || 'Untitled document';
      try {
        await insertNotification({
          userId: requesterUserId,
          type: 'access_denied',
          title: 'Access request declined',
          body: `Your request for “${docTitle}” was declined.`,
          documentId,
          metadata: {},
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[access-requests] requester notification (deny) failed:', e?.message || e);
      }

      return { ok: true, decision: 'denied' };
    }

    if (decision !== 'approve') {
      await client.query('rollback');
      throw clientError('invalid_decision', 'decision must be approve or deny');
    }

    const memberRole = row.requested_role === 'viewer' ? 'viewer' : 'editor';
    await client.query(
      `
        insert into document_members (document_id, user_id, role)
        values ($1, $2, $3)
        on conflict (document_id, user_id) do update set
          role = case
            when document_members.role = 'owner' then document_members.role
            else excluded.role
          end,
          updated_at = now();
      `,
      [documentId, row.requester_user_id, memberRole]
    );

    await client.query(
      `
        update document_access_requests
        set status = 'approved', resolved_at = now()
        where id = $1;
      `,
      [requestId]
    );
    await client.query('commit');

    const docRow = await pool.query(`select title from documents where id = $1`, [documentId]);
    const title =
      (docRow.rows[0]?.title && String(docRow.rows[0].title).trim()) || 'Untitled document';
    try {
      await insertNotification({
        userId: row.requester_user_id,
        type: 'access_granted',
        title: `You can open “${title}”`,
        body: 'An owner approved your access request.',
        documentId,
        metadata: {},
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[access-requests] requester notification (approve) failed:', e?.message || e);
    }

    return { ok: true, decision: 'approved' };
  } catch (e) {
    try {
      await client.query('rollback');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

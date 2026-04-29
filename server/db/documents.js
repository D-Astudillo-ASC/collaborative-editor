import crypto from 'crypto';
import { getPool } from './pool.js';
import { listPendingAccessRequestsForDocument } from './access-requests.js';

const ALLOWED_EDITOR_LANGUAGES = new Set([
  'javascript',
  'typescript',
  'typescriptreact',
  'java',
  'python',
  'html',
]);

function normalizeEditorLanguage(value) {
  if (typeof value !== 'string' || !ALLOWED_EDITOR_LANGUAGES.has(value)) {
    return 'typescript';
  }
  return value;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeEqual(a, b) {
  try {
    const ba = Buffer.from(String(a), 'utf8');
    const bb = Buffer.from(String(b), 'utf8');
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

async function listDocumentsForUser(userId) {
  const pool = getPool();
  const res = await pool.query(
    `
      select d.id, d.title, d.updated_at as "lastModified"
      from documents d
      join document_members m on m.document_id = d.id
      where m.user_id = $1 and d.archived_at is null
      order by d.updated_at desc;
    `,
    [userId]
  );
  return res.rows;
}

async function createDocumentForUser({ userId, title, initialUpdateBytes, editorLanguage }) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('begin;');
    const lang = normalizeEditorLanguage(editorLanguage);
    const docRes = await client.query(
      `
        insert into documents (title, owner_user_id, share_status, editor_language)
        values ($1, $2, 'private', $3)
        returning id, title, updated_at as "lastModified";
      `,
      [title, userId, lang]
    );
    const doc = docRes.rows[0];

    await client.query(
      `insert into document_state (document_id, latest_snapshot_seq, latest_update_seq, updated_at)
       values ($1, 0, 0, now());`,
      [doc.id]
    );

    await client.query(
      `insert into document_members (document_id, user_id, role)
       values ($1, $2, 'owner');`,
      [doc.id, userId]
    );

    if (initialUpdateBytes) {
      // PREVIOUS IMPLEMENTATION (commented out):
      // - No initial content was persisted; the first client would "create" content by sending updates later.
      //
      // Reason for change:
      // - When creating a document from a template, we store the initial Yjs state as the first persisted update (seq=1).
      const seq = 1;
      await client.query(
        `
          insert into document_updates (document_id, seq, actor_user_id, update)
          values ($1, $2, $3, $4);
        `,
        [doc.id, seq, userId, Buffer.from(initialUpdateBytes)]
      );
      await client.query(
        `update document_state set latest_update_seq = $2, updated_at = now() where document_id = $1;`,
        [doc.id, seq]
      );
      await client.query(`update documents set updated_at = now() where id = $1;`, [doc.id]);
    }

    await client.query('commit;');
    return doc;
  } catch (e) {
    await client.query('rollback;');
    throw e;
  } finally {
    client.release();
  }
}

async function getMemberRole({ userId, documentId }) {
  const pool = getPool();
  const res = await pool.query(
    `select role from document_members where document_id = $1 and user_id = $2;`,
    [documentId, userId]
  );
  return res.rows[0]?.role || null;
}

async function getShareInfo(documentId) {
  const pool = getPool();
  const res = await pool.query(
    `select share_status, link_share_token_hash from documents where id = $1;`,
    [documentId]
  );
  return res.rows[0] || null;
}

async function validateLinkToken({ documentId, token }) {
  if (!token) return null;
  const info = await getShareInfo(documentId);
  if (!info?.link_share_token_hash) return null;

  const hash = sha256Hex(token);
  if (!safeEqual(hash, info.link_share_token_hash)) return null;

  if (info.share_status === 'public_link_view') return 'viewer';
  if (info.share_status === 'public_link_edit') return 'editor';
  return null;
}

/**
 * Metadata for clients that can access the document (member or valid link token).
 */
async function getDocumentMetaForAccess({ userId, documentId, linkToken }) {
  let role = await getMemberRole({ userId, documentId });
  if (!role) role = await validateLinkToken({ documentId, token: linkToken });
  if (!role) return null;

  const pool = getPool();
  const res = await pool.query(
    `
      select id,
             title,
             coalesce(editor_language, 'typescript') as "editorLanguage"
      from documents
      where id = $1
        and archived_at is null
      limit 1;
    `,
    [documentId]
  );
  if (!res.rows.length) return null;
  return { ...res.rows[0], role };
}

/**
 * Title and/or editor language — only owner or editor (not viewer / link-view).
 */
async function updateDocumentMeta({ userId, documentId, title, editorLanguage }) {
  const role = await getMemberRole({ userId, documentId });
  if (role !== 'owner' && role !== 'editor') {
    const err = new Error('forbidden');
    err.statusCode = 403;
    throw err;
  }

  const sets = [];
  const vals = [];
  let n = 1;

  if (typeof title === 'string') {
    const t = title.trim();
    if (t.length > 0) {
      sets.push(`title = $${n++}`);
      vals.push(t.slice(0, 500));
    }
  }
  if (typeof editorLanguage === 'string' && ALLOWED_EDITOR_LANGUAGES.has(editorLanguage)) {
    sets.push(`editor_language = $${n++}`);
    vals.push(editorLanguage);
  }

  if (sets.length === 0) return;

  const pool = getPool();
  vals.push(documentId);
  await pool.query(
    `update documents set ${sets.join(', ')}, updated_at = now() where id = $${n};`,
    vals
  );
}

async function rotateShareLink({ userId, documentId, mode }) {
  const role = await getMemberRole({ userId, documentId });
  if (role !== 'owner') {
    const err = new Error('forbidden');
    err.statusCode = 403;
    throw err;
  }

  const token = crypto.randomBytes(24).toString('base64url');
  const tokenHash = sha256Hex(token);
  const shareStatus = mode === 'edit' ? 'public_link_edit' : 'public_link_view';

  const pool = getPool();
  await pool.query(
    `
      update documents
      set share_status = $2,
          link_share_token_hash = $3,
          updated_at = now()
      where id = $1;
    `,
    [documentId, shareStatus, tokenHash]
  );

  return { token, shareStatus };
}

function forbiddenError() {
  const err = new Error('forbidden');
  err.statusCode = 403;
  return err;
}

async function assertDocumentOwner({ userId, documentId }) {
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
    throw forbiddenError();
  }
}

async function listDocumentMembersAndInvites({ userId, documentId }) {
  await assertDocumentOwner({ userId, documentId });
  const pool = getPool();

  const members = await pool.query(
    `
      select
        u.id as "userId",
        m.role,
        u.email,
        u.name,
        u.avatar_url as "avatarUrl"
      from document_members m
      join users u on u.id = m.user_id
      where m.document_id = $1
      order by case m.role when 'owner' then 0 else 1 end, u.email nulls last, u.name nulls last;
    `,
    [documentId]
  );

  const pendingAccessRequests = await listPendingAccessRequestsForDocument(documentId);

  return { members: members.rows, pendingInvites: [], pendingAccessRequests };
}

async function updateDocumentMemberRole({ ownerUserId, documentId, targetUserId, role }) {
  if (role !== 'editor' && role !== 'viewer') {
    const err = new Error('invalid_role');
    err.statusCode = 400;
    throw err;
  }

  await assertDocumentOwner({ userId: ownerUserId, documentId });
  const pool = getPool();

  const doc = await pool.query(`select owner_user_id from documents where id = $1`, [documentId]);
  if (doc.rows[0]?.owner_user_id === targetUserId) {
    const err = new Error('cannot_change_owner_role');
    err.statusCode = 400;
    throw err;
  }

  const res = await pool.query(
    `
      update document_members
      set role = $3, updated_at = now()
      where document_id = $1 and user_id = $2 and role <> 'owner';
    `,
    [documentId, targetUserId, role]
  );
  if (res.rowCount === 0) {
    const err = new Error('not_found');
    err.statusCode = 404;
    throw err;
  }
}

async function removeDocumentMember({ ownerUserId, documentId, targetUserId }) {
  await assertDocumentOwner({ userId: ownerUserId, documentId });
  const pool = getPool();

  const doc = await pool.query(`select owner_user_id from documents where id = $1`, [documentId]);
  if (doc.rows[0]?.owner_user_id === targetUserId) {
    const err = new Error('cannot_remove_owner');
    err.statusCode = 400;
    throw err;
  }

  const res = await pool.query(
    `delete from document_members where document_id = $1 and user_id = $2`,
    [documentId, targetUserId]
  );
  if (res.rowCount === 0) {
    const err = new Error('not_found');
    err.statusCode = 404;
    throw err;
  }
}

export {
  listDocumentsForUser,
  createDocumentForUser,
  getMemberRole,
  validateLinkToken,
  rotateShareLink,
  getDocumentMetaForAccess,
  updateDocumentMeta,
  listDocumentMembersAndInvites,
  updateDocumentMemberRole,
  removeDocumentMember,
};


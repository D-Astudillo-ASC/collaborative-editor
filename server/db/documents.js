const crypto = require('crypto');
const { getPool } = require('./pool');

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

async function createDocumentForUser({ userId, title, initialUpdateBytes }) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('begin;');
    const docRes = await client.query(
      `
        insert into documents (title, owner_user_id, share_status)
        values ($1, $2, 'private')
        returning id, title, updated_at as "lastModified";
      `,
      [title, userId]
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

module.exports = {
  listDocumentsForUser,
  createDocumentForUser,
  getMemberRole,
  validateLinkToken,
  rotateShareLink,
};


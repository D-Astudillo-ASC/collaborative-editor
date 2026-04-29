import { getPool } from './pool.js';

const MAX_LIST = 100;

/**
 * @param {{ userId: string, type: string, title: string, body?: string | null, documentId?: string | null, metadata?: object }} row
 */
export async function insertNotification({ userId, type, title, body = null, documentId = null, metadata = {} }) {
  const pool = getPool();
  const res = await pool.query(
    `
      insert into user_notifications (user_id, type, title, body, document_id, metadata)
      values ($1, $2, $3, $4, $5, $6::jsonb)
      returning
        id,
        type,
        title,
        body,
        document_id as "documentId",
        metadata,
        read_at as "readAt",
        created_at as "createdAt";
    `,
    [userId, type, title, body, documentId, JSON.stringify(metadata ?? {})]
  );
  return res.rows[0];
}

export async function listNotificationsForUser(userId, { limit = 50 } = {}) {
  const pool = getPool();
  const take = Math.min(Math.max(Number(limit) || 50, 1), MAX_LIST);
  const res = await pool.query(
    `
      select
        id,
        type,
        title,
        body,
        document_id as "documentId",
        metadata,
        read_at as "readAt",
        created_at as "createdAt"
      from user_notifications
      where user_id = $1
      order by created_at desc
      limit $2;
    `,
    [userId, take]
  );
  return res.rows;
}

export async function countUnreadNotifications(userId) {
  const pool = getPool();
  const res = await pool.query(
    `select count(*)::int as n from user_notifications where user_id = $1 and read_at is null;`,
    [userId]
  );
  return res.rows[0]?.n ?? 0;
}

export async function markNotificationRead({ userId, notificationId }) {
  const pool = getPool();
  const res = await pool.query(
    `
      update user_notifications
      set read_at = coalesce(read_at, now())
      where id = $1 and user_id = $2
      returning id;
    `,
    [notificationId, userId]
  );
  return res.rowCount > 0;
}

export async function markAllNotificationsRead(userId) {
  const pool = getPool();
  await pool.query(
    `
      update user_notifications
      set read_at = now()
      where user_id = $1 and read_at is null;
    `,
    [userId]
  );
}

export async function deleteNotificationForUser({ userId, notificationId }) {
  const pool = getPool();
  const res = await pool.query(
    `delete from user_notifications where id = $1 and user_id = $2`,
    [notificationId, userId]
  );
  return res.rowCount > 0;
}

export async function deleteAllNotificationsForUser(userId) {
  const pool = getPool();
  await pool.query(`delete from user_notifications where user_id = $1`, [userId]);
}

/**
 * In-app notice when someone is added as editor/viewer (share dialog).
 *
 * @param {{ recipientUserId: string, documentId: string, role: 'editor'|'viewer' }} p
 */
export async function notifyUserDocumentMembership({ recipientUserId, documentId, role }) {
  try {
    const pool = getPool();
    const doc = await pool.query(
      `select title from documents where id = $1 and archived_at is null`,
      [documentId]
    );
    if (!doc.rows.length) return;
    const title = (doc.rows[0]?.title && String(doc.rows[0].title).trim()) || 'Untitled document';
    const roleLabel = role === 'viewer' ? 'view' : 'edit';
    await insertNotification({
      userId: recipientUserId,
      type: 'member_added',
      title: `You were added to “${title}”`,
      body: `You can ${roleLabel} this document.`,
      documentId,
      metadata: { role },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[notifications] member_added notify failed:', e?.message || e);
  }
}

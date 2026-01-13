import { getPool } from './pool.js';

async function listFoldersForUser(userId) {
  const pool = getPool();
  const res = await pool.query(
    `
      select id, name, parent_folder_id as "parentFolderId", updated_at as "updatedAt"
      from folders
      where owner_user_id = $1
      order by updated_at desc;
    `,
    [userId]
  );
  return res.rows;
}

async function createFolderForUser({ userId, name, parentFolderId }) {
  const pool = getPool();
  const res = await pool.query(
    `
      insert into folders (owner_user_id, name, parent_folder_id)
      values ($1, $2, $3)
      returning id, name, parent_folder_id as "parentFolderId", updated_at as "updatedAt";
    `,
    [userId, name, parentFolderId || null]
  );
  return res.rows[0];
}

export { listFoldersForUser, createFolderForUser };


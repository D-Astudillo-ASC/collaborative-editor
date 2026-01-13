const { getPool } = require('./pool');

async function upsertUserByClerkId({ clerkUserId, email, name, avatarUrl }) {
  if (!clerkUserId) {
    throw new Error('Missing clerkUserId');
  }

  const pool = getPool();
  const res = await pool.query(
    `
      insert into users (clerk_user_id, email, name, avatar_url)
      values ($1, $2, $3, $4)
      on conflict (clerk_user_id)
      do update set
        email = excluded.email,
        name = excluded.name,
        avatar_url = excluded.avatar_url,
        updated_at = now()
      returning id, clerk_user_id, email, name, avatar_url;
    `,
    [clerkUserId, email, name, avatarUrl]
  );
  return res.rows[0];
}

module.exports = { upsertUserByClerkId };


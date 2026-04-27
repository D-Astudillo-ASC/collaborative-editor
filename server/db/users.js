import { getPool } from './pool.js';

/**
 * Upsert a user by their Clerk id.
 *
 * Important: Clerk's default session JWT only includes `sub`. Other fields like
 * `email`, `name`, and `picture` require a custom JWT template. When a thin JWT
 * comes in, those fields arrive as `null`. We use COALESCE on update so a thin
 * JWT auth call NEVER blows away a richer profile previously synced from the
 * client (via /api/users/me/sync-profile or the socket profile sync event).
 */
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
        email = coalesce(excluded.email, users.email),
        name = coalesce(excluded.name, users.name),
        avatar_url = coalesce(excluded.avatar_url, users.avatar_url),
        updated_at = now()
      returning id, clerk_user_id, email, name, avatar_url;
    `,
    [clerkUserId, email, name, avatarUrl]
  );
  return res.rows[0];
}

export { upsertUserByClerkId };


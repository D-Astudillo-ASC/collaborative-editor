/**
 * Google Docs–style people search: Clerk getUserList when CLERK_SECRET_KEY is set,
 * else Postgres users table (people who have signed in at least once).
 */

import { getPool } from './pool.js';
import { getClerkBackend, clerkUserToProfile } from '../lib/clerk-directory.js';

/**
 * @param {object} opts
 * @param {string} opts.query
 * @param {string | null} opts.documentId
 * @param {string} opts.requesterUserId  internal users.id
 * @param {string | null} opts.requesterClerkUserId
 * @returns {Promise<{ source: 'clerk' | 'database' | 'none', users: Array<object> }>}
 */
async function searchShareDirectory({
  query,
  documentId,
  requesterUserId,
  requesterClerkUserId,
}) {
  const q = String(query || '').trim();
  if (q.length < 2 || q.length > 80) {
    return { source: 'none', users: [] };
  }

  const pool = getPool();
  const memberInternalIds = new Set();
  const memberClerkIds = new Set();

  if (documentId) {
    const mr = await pool.query(
      `
        select m.user_id, u.clerk_user_id
        from document_members m
        join users u on u.id = m.user_id
        where m.document_id = $1;
      `,
      [documentId]
    );
    for (const row of mr.rows) {
      memberInternalIds.add(row.user_id);
      if (row.clerk_user_id) memberClerkIds.add(row.clerk_user_id);
    }
  }

  const clerk = getClerkBackend();
  if (clerk) {
    try {
      const { data } = await clerk.users.getUserList({ query: q, limit: 20 });
      const out = [];
      for (const u of data) {
        if (requesterClerkUserId && u.id === requesterClerkUserId) continue;
        if (memberClerkIds.has(u.id)) continue;

        const prof = clerkUserToProfile(u);
        const row = await pool.query(`select id from users where clerk_user_id = $1`, [u.id]);
        const internalId = row.rows[0]?.id ?? null;
        if (internalId && memberInternalIds.has(internalId)) continue;

        out.push({
          userId: internalId,
          clerkUserId: u.id,
          email: prof.email,
          name: prof.name,
          avatarUrl: prof.avatarUrl,
        });
        if (out.length >= 15) break;
      }
      return { source: 'clerk', users: out };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[searchShareDirectory] Clerk getUserList failed; falling back to DB:', e?.message || e);
    }
  }

  const escaped = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  const pat = `%${escaped}%`;

  const res = await pool.query(
    `
      select u.id, u.clerk_user_id, u.email, u.name, u.avatar_url
      from users u
      where u.id <> $1::uuid
        and ($2::uuid is null or u.id not in (
          select user_id from document_members where document_id = $2::uuid
        ))
        and (
          u.email ilike $3 escape '\\'
          or coalesce(u.name, '') ilike $3 escape '\\'
        )
      order by u.email nulls last
      limit 15;
    `,
    [requesterUserId, documentId, pat]
  );

  const users = res.rows.map((r) => ({
    userId: r.id,
    clerkUserId: r.clerk_user_id,
    email: r.email,
    name: r.name,
    avatarUrl: r.avatar_url,
  }));

  return { source: 'database', users };
}

export { searchShareDirectory };

/**
 * Phase 7 + Phase 2 hardening — Chat DB helpers.
 *
 * Messages live alongside documents in Postgres. The `metadata` JSONB column
 * keeps the schema extensible (mentions, future enrichments) without
 * additional migrations. First-class columns are reserved for things we need
 * to enforce or query on (edits, deletes, replies).
 *
 * Authorization gates (15-min edit window, ownership) are enforced inside
 * the SQL `WHERE` clauses so they cannot be bypassed by client-side time
 * manipulation or stale state.
 */

import { getPool } from './pool.js';

const MAX_CONTENT_CHARS = 1_000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/**
 * Window during which a sender may edit or soft-delete their own messages.
 * Server-side enforced via SQL — the client only renders the menu when
 * within the window, but the source of truth is here.
 */
const EDIT_WINDOW_INTERVAL = "interval '15 minutes'";

/** Max chars of the parent message we surface inside a reply's quoted header. */
const PARENT_EXCERPT_CHARS = 140;

// ---------------------------------------------------------------------------
// Shared SELECT shapes
// ---------------------------------------------------------------------------
//
// We have two flavors of column projection:
//
//   1. MESSAGE_COLUMNS_SQL_M — for queries that read straight from
//      chat_messages (e.g. listMessages). Aliases columns from `m` and joins
//      `users u` + a LATERAL parent snapshot.
//
//   2. CTE_ROW_PROJECTION   — for write paths (insertMessage / updateMessage
//      / softDeleteMessage) where we MUST hydrate the row from a modifying
//      CTE's RETURNING clause rather than from `chat_messages`. Reason:
//      PostgreSQL's modifying CTEs run with the snapshot taken before the
//      modification, so a follow-up SELECT against `chat_messages` cannot
//      see the row that the same statement just wrote. Returning the full
//      row from the CTE sidesteps that snapshot trap.

const MESSAGE_COLUMNS_SQL_M = `
    m.id,
    m.document_id      as "documentId",
    m.user_id          as "userId",
    m.client_id        as "clientId",
    case when m.deleted_at is null then m.content else '' end as content,
    m.metadata,
    m.created_at       as "createdAt",
    m.edited_at        as "editedAt",
    m.deleted_at       as "deletedAt",
    m.parent_id        as "parentId",
    u.clerk_user_id    as "senderClerkId",
    u.name             as "senderName",
    u.email            as "senderEmail",
    u.avatar_url       as "senderAvatarUrl",
    p.parent_snapshot  as "parent"
`;

// LATERAL join expression used to compute a small parent snapshot. Only
// runs when m.parent_id is not null. If the parent has been deleted we
// surface that fact (`deletedAt` set, content blanked) so the UI can render
// a "(reply to a deleted message)" affordance instead of breaking layout.
const PARENT_LATERAL_SQL = `
    left join lateral (
      select jsonb_build_object(
        'id', pm.id,
        'authorName', pu.name,
        'authorClerkId', pu.clerk_user_id,
        'authorAvatarUrl', pu.avatar_url,
        'createdAt', pm.created_at,
        'contentExcerpt', case
          when pm.deleted_at is not null then ''
          else left(pm.content, ${PARENT_EXCERPT_CHARS})
        end,
        'deletedAt', pm.deleted_at
      ) as parent_snapshot
      from chat_messages pm
      join users pu on pu.id = pm.user_id
      where pm.id = m.parent_id
    ) p on true
`;

// Same parent-snapshot subquery, but anchored on a CTE row alias `r` (with
// columns from chat_messages) instead of `m`. Used by write-path queries
// where we hydrate from the modifying CTE's RETURNING.
const PARENT_LATERAL_FOR_CTE_SQL = `
    left join lateral (
      select jsonb_build_object(
        'id', pm.id,
        'authorName', pu.name,
        'authorClerkId', pu.clerk_user_id,
        'authorAvatarUrl', pu.avatar_url,
        'createdAt', pm.created_at,
        'contentExcerpt', case
          when pm.deleted_at is not null then ''
          else left(pm.content, ${PARENT_EXCERPT_CHARS})
        end,
        'deletedAt', pm.deleted_at
      ) as parent_snapshot
      from chat_messages pm
      join users pu on pu.id = pm.user_id
      where pm.id = r.parent_id
    ) p on true
`;

// Projection that aliases the CTE row `r` plus joined `users u` + parent.
const MESSAGE_COLUMNS_SQL_CTE = `
    r.id,
    r.document_id      as "documentId",
    r.user_id          as "userId",
    r.client_id        as "clientId",
    case when r.deleted_at is null then r.content else '' end as content,
    r.metadata,
    r.created_at       as "createdAt",
    r.edited_at        as "editedAt",
    r.deleted_at       as "deletedAt",
    r.parent_id        as "parentId",
    u.clerk_user_id    as "senderClerkId",
    u.name             as "senderName",
    u.email            as "senderEmail",
    u.avatar_url       as "senderAvatarUrl",
    p.parent_snapshot  as "parent"
`;

// ---------------------------------------------------------------------------
// listMessages
// ---------------------------------------------------------------------------

/**
 * List messages for a document, newest-first, with cursor-based pagination.
 * Tombstones (deleted_at not null) are returned with content blanked so the
 * UI can render a "— message deleted —" placeholder while preserving thread
 * continuity.
 *
 * @param {object} params
 * @param {string} params.documentId
 * @param {string=} params.before  - Return messages strictly older than this id.
 * @param {number=} params.limit
 */
async function listMessages({ documentId, before, limit }) {
  const pool = getPool();
  const pageSize = Math.min(
    Math.max(Number(limit) || DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );

  const params = [documentId, pageSize];
  let cursorClause = '';
  if (before) {
    params.push(before);
    cursorClause = `
      and (m.created_at, m.id) < (
        (select created_at from chat_messages where id = $${params.length}),
        $${params.length}
      )
    `;
  }

  const sql = `
    select ${MESSAGE_COLUMNS_SQL_M}
    from chat_messages m
    join users u on u.id = m.user_id
    ${PARENT_LATERAL_SQL}
    where m.document_id = $1
    ${cursorClause}
    order by m.created_at desc, m.id desc
    limit $2;
  `;

  const res = await pool.query(sql, params);
  return res.rows;
}

// ---------------------------------------------------------------------------
// insertMessage
// ---------------------------------------------------------------------------

/**
 * Insert a new message for a document.
 *
 * Idempotent on (document_id, client_id): retrying with the same client_id
 * returns the existing row instead of creating a duplicate.
 *
 * `parentId` and `mentions` are optional Phase-2 additions:
 *   - `parentId` is validated to belong to the same document; cross-document
 *     replies are silently nulled (defense-in-depth — the server is the
 *     source of truth for thread structure).
 *   - `mentions` is an array of clerk ids resolved against the local users
 *     table; unknown ids are dropped so the rendered highlight is honest.
 */
async function insertMessage({
  documentId,
  userId,
  clientId,
  content,
  parentId,
  mentions,
  /** Clerk user id of the sender — self-mentions are dropped (defense in depth). */
  senderClerkId,
}) {
  if (!documentId) throw new Error('missing_documentId');
  if (!userId) throw new Error('missing_userId');
  if (typeof content !== 'string') throw new Error('invalid_content');

  const trimmed = content.trim();
  if (!trimmed) throw new Error('empty_content');
  if (trimmed.length > MAX_CONTENT_CHARS) throw new Error('content_too_long');

  const pool = getPool();
  const safeClientId =
    typeof clientId === 'string' && clientId.length > 0 && clientId.length <= 64
      ? clientId
      : null;

  // ---- parent_id validation ------------------------------------------------
  // A parentId is only honored if it exists *and* belongs to the same
  // document. Otherwise we drop it to null. The check happens inside the
  // INSERT via a subquery so it's atomic — no TOCTOU window between the
  // existence check and the insert.
  const safeParentId = isUuid(parentId) ? parentId : null;

  // ---- mention resolution --------------------------------------------------
  // Resolve mention clerkIds to a [{ clerkId, name }] list using a single
  // round-trip. We accept up to 20 distinct ids to bound the cost.
  // Strip self-mentions so metadata never flags the author as @mentioned.
  const mentionIds = Array.isArray(mentions) ? mentions : [];
  const mentionIdsSansSelf =
    typeof senderClerkId === 'string' && senderClerkId.length > 0
      ? mentionIds.filter((m) => m !== senderClerkId)
      : mentionIds;
  const resolvedMentions = await resolveMentions(pool, mentionIdsSansSelf);
  const metadataJson =
    resolvedMentions.length > 0
      ? JSON.stringify({ mentions: resolvedMentions })
      : '{}';

  // We have to hydrate the canonical row from the modifying CTE itself —
  // PostgreSQL gives the outer SELECT the snapshot taken *before* the
  // INSERT runs, so re-querying chat_messages would see no row for a
  // brand-new insert. ON CONFLICT lets us safely retry transient network
  // errors without creating duplicates; on conflict we fall through to a
  // direct lookup of the existing row, which IS visible because it was
  // committed in a prior transaction.
  const sql = `
    with parent_validated as (
      select id from chat_messages
      where id = $5::uuid
        and document_id = $1
      limit 1
    ),
    inserted as (
      insert into chat_messages (
        document_id,
        user_id,
        client_id,
        content,
        parent_id,
        metadata
      )
      values (
        $1,
        $2,
        $3,
        $4,
        (select id from parent_validated),
        $6::jsonb
      )
      on conflict (document_id, client_id)
        where client_id is not null
        do nothing
      returning *
    ),
    target as (
      -- Successful insert: row materialised in the inserted CTE.
      select * from inserted
      union all
      -- Conflict path: the existing row pre-dates this statement so a fresh
      -- read off chat_messages can see it. The insert returned 0 rows, so
      -- the union does not double up.
      select cm.*
      from chat_messages cm
      where not exists (select 1 from inserted)
        and cm.document_id = $1
        and cm.client_id is not null
        and cm.client_id = $3
      limit 1
    )
    select ${MESSAGE_COLUMNS_SQL_CTE}
    from target r
    join users u on u.id = r.user_id
    ${PARENT_LATERAL_FOR_CTE_SQL}
    limit 1;
  `;

  const res = await pool.query(sql, [
    documentId,
    userId,
    safeClientId,
    trimmed,
    safeParentId,
    metadataJson,
  ]);
  return res.rows[0];
}

// ---------------------------------------------------------------------------
// updateMessage  (Phase 2 — edit within window)
// ---------------------------------------------------------------------------

/**
 * Apply an edit to an own, non-deleted message that is still inside the
 * 15-minute edit window. Returns the canonical row on success, or `null`
 * if the gate rejects (caller maps to a `chat:error`). The gate is fully
 * inside SQL so we can never accidentally relax it from the application
 * layer.
 *
 * Note: we deliberately *do not* track edit history in this phase. If/when
 * we add it, the column lives in this table and the public API stays the
 * same — the change is purely additive.
 */
async function updateMessage({ messageId, userId, content }) {
  if (!isUuid(messageId)) throw new Error('invalid_messageId');
  if (!userId) throw new Error('missing_userId');
  if (typeof content !== 'string') throw new Error('invalid_content');
  const trimmed = content.trim();
  if (!trimmed) throw new Error('empty_content');
  if (trimmed.length > MAX_CONTENT_CHARS) throw new Error('content_too_long');

  const pool = getPool();
  // Same snapshot caveat as insertMessage — hydrate the row from the CTE's
  // RETURNING rather than re-reading chat_messages, otherwise we'd see the
  // pre-update snapshot and break the broadcast payload.
  const sql = `
    with updated as (
      update chat_messages
         set content = $3,
             edited_at = now()
       where id = $1
         and user_id = $2
         and deleted_at is null
         and now() - created_at < ${EDIT_WINDOW_INTERVAL}
      returning *
    )
    select ${MESSAGE_COLUMNS_SQL_CTE}
    from updated r
    join users u on u.id = r.user_id
    ${PARENT_LATERAL_FOR_CTE_SQL}
    limit 1;
  `;

  const res = await pool.query(sql, [messageId, userId, trimmed]);
  return res.rows[0] || null;
}

// ---------------------------------------------------------------------------
// softDeleteMessage  (Phase 2 — delete within window)
// ---------------------------------------------------------------------------

/**
 * Soft-delete an own message that is still inside the 15-minute window.
 * The row remains so reply context survives, but `content` is wiped and
 * `deleted_at` is set. Subsequent reads see content='' regardless of what
 * the row physically contains, because listMessages applies a CASE.
 *
 * Returns the post-delete row (so the broadcast carries authoritative
 * timestamps) or `null` if the gate rejects.
 */
async function softDeleteMessage({ messageId, userId }) {
  if (!isUuid(messageId)) throw new Error('invalid_messageId');
  if (!userId) throw new Error('missing_userId');

  const pool = getPool();
  // Same snapshot caveat as insertMessage / updateMessage.
  const sql = `
    with deleted as (
      update chat_messages
         set deleted_at = now(),
             content = ''
       where id = $1
         and user_id = $2
         and deleted_at is null
         and now() - created_at < ${EDIT_WINDOW_INTERVAL}
      returning *
    )
    select ${MESSAGE_COLUMNS_SQL_CTE}
    from deleted r
    join users u on u.id = r.user_id
    ${PARENT_LATERAL_FOR_CTE_SQL}
    limit 1;
  `;

  const res = await pool.query(sql, [messageId, userId]);
  return res.rows[0] || null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Look up display names for the given clerk-ids. Anything we can't resolve
 * gets dropped silently — the rendered highlight on the receiving side
 * should never light up against a stranger's name.
 */
async function resolveMentions(pool, mentions) {
  if (!Array.isArray(mentions) || mentions.length === 0) return [];
  const unique = Array.from(
    new Set(
      mentions.filter((m) => typeof m === 'string' && m.length > 0 && m.length <= 64),
    ),
  ).slice(0, 20);
  if (unique.length === 0) return [];
  const sql = `
    select clerk_user_id as "clerkId", name as "name"
    from users
    where clerk_user_id = any($1::text[])
    limit 20;
  `;
  const res = await pool.query(sql, [unique]);
  return res.rows;
}

export {
  listMessages,
  insertMessage,
  updateMessage,
  softDeleteMessage,
  MAX_CONTENT_CHARS,
};

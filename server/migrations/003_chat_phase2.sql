-- Phase 2 hardening — Document Chat depth.
--
-- Adds first-class columns for editing, soft-deletion, and replies.
-- Mentions stay in the existing `metadata` JSONB column (no relational
-- queries depend on them, and the resolved-mention payload is small).
--
-- Why first-class columns:
--   edited_at  → drives the "(edited)" UI affordance and the 15-min
--                edit-window gate is enforced in SQL using created_at,
--                so the client cannot be tricked by clock skew.
--   deleted_at → enables the tombstone UX and lets us preserve thread
--                context after a delete (vs hard-deleting the row).
--   parent_id  → first-class FK so replies survive cascade rules and
--                we can index them efficiently.

alter table chat_messages
  add column if not exists edited_at  timestamptz null,
  add column if not exists deleted_at timestamptz null,
  add column if not exists parent_id  uuid null
    references chat_messages(id) on delete set null;

-- Most messages are not replies, so a partial index keeps it small while
-- still serving the LATERAL parent-snapshot lookup we use in listMessages.
create index if not exists chat_messages_parent_idx
  on chat_messages(parent_id)
  where parent_id is not null;

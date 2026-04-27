-- Phase 7: Document Chat
-- Persisted messages keyed by document. JSONB metadata column gives us
-- document-store flexibility for future enrichments (reactions, edits,
-- mentions, attachments) without further schema changes.

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  -- Client-supplied id used to dedupe optimistic inserts when the server
  -- echoes the canonical message back over the websocket.
  client_id text null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Pagination: newest-first listing per document.
create index if not exists chat_messages_doc_created_idx
  on chat_messages(document_id, created_at desc, id desc);

-- Per-document optimistic dedupe. A client_id is unique within a document
-- so we can safely retry a failed send with the same client_id.
create unique index if not exists chat_messages_doc_client_id_uniq_idx
  on chat_messages(document_id, client_id) where client_id is not null;

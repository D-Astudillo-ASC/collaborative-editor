create table if not exists document_access_requests (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  requester_user_id uuid not null references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  requested_role text not null default 'editor' check (requested_role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index if not exists document_access_requests_pending_uniq
  on document_access_requests(document_id, requester_user_id)
  where status = 'pending';

create index if not exists document_access_requests_document_pending_idx
  on document_access_requests(document_id)
  where status = 'pending';

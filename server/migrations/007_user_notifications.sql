create table if not exists user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  document_id uuid references documents(id) on delete set null,
  metadata jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_created_idx
  on user_notifications(user_id, created_at desc);

create index if not exists user_notifications_user_unread_idx
  on user_notifications(user_id)
  where read_at is null;

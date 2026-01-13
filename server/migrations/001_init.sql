-- collaborative-editor initial schema (Neon Postgres)
-- Source of truth tables: users, documents, sharing, folders, and Yjs update log.

create extension if not exists pgcrypto;

create table if not exists schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  email text,
  name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  owner_user_id uuid not null references users(id) on delete restrict,
  share_status text not null default 'private',
  link_share_token_hash text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  constraint documents_share_status_check check (
    share_status in ('private','restricted','public_link_view','public_link_edit')
  )
);

create index if not exists documents_owner_user_id_idx on documents(owner_user_id);

create table if not exists document_members (
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_members_role_check check (role in ('owner','editor','viewer')),
  constraint document_members_pk primary key (document_id, user_id)
);

create index if not exists document_members_user_id_idx on document_members(user_id);

create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users(id) on delete cascade,
  name text not null,
  parent_folder_id uuid null references folders(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists folders_owner_user_id_idx on folders(owner_user_id);
create index if not exists folders_parent_folder_id_idx on folders(parent_folder_id);

create table if not exists document_folders (
  document_id uuid not null references documents(id) on delete cascade,
  folder_id uuid not null references folders(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint document_folders_pk primary key (document_id, folder_id)
);

create table if not exists document_state (
  document_id uuid primary key references documents(id) on delete cascade,
  latest_snapshot_seq bigint not null default 0,
  latest_snapshot_r2_key text null,
  latest_update_seq bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists document_updates (
  document_id uuid not null references documents(id) on delete cascade,
  seq bigint not null,
  created_at timestamptz not null default now(),
  actor_user_id uuid null references users(id) on delete set null,
  update bytea not null,
  constraint document_updates_pk primary key (document_id, seq)
);

create index if not exists document_updates_document_id_created_at_idx
  on document_updates(document_id, created_at);


-- Email-based invites for users who have not signed in yet (no row in users).
-- Claimed on login when JWT includes a matching email (see claimDocumentInvitesForUser).

create table if not exists document_invites (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  email_normalized text not null,
  role text not null,
  invited_by_user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint document_invites_role_check check (role in ('editor', 'viewer')),
  constraint document_invites_document_email_uniq unique (document_id, email_normalized)
);

create index if not exists document_invites_email_idx
  on document_invites (email_normalized);

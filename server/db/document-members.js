/**
 * Add document members by internal user id or Clerk user id (directory picker).
 * Does not import ./documents.js (avoids cycles with users.js).
 * Emits in-app `member_added` notifications via ./notifications.js.
 */

import { getPool } from './pool.js';
import { upsertUserByClerkId } from './users.js';
import { getClerkBackend, clerkUserToProfile } from '../lib/clerk-directory.js';
import { notifyUserDocumentMembership } from './notifications.js';

function forbidden() {
  const e = new Error('forbidden');
  e.statusCode = 403;
  return e;
}

function clientError(code, message) {
  const e = new Error(message);
  e.statusCode = 400;
  e.code = code;
  return e;
}

async function assertOwner(pool, ownerUserId, documentId) {
  const doc = await pool.query(
    `
      select d.owner_user_id
      from documents d
      where d.id = $1 and d.archived_at is null;
    `,
    [documentId]
  );
  if (!doc.rows.length) {
    const e = new Error('not_found');
    e.statusCode = 404;
    throw e;
  }
  if (doc.rows[0].owner_user_id !== ownerUserId) {
    throw forbidden();
  }
  return doc.rows[0].owner_user_id;
}

async function insertMember(pool, documentId, targetUserId, role) {
  await pool.query(
    `
      insert into document_members (document_id, user_id, role)
      values ($1, $2, $3)
      on conflict (document_id, user_id) do update set
        role = case
          when document_members.role = 'owner' then document_members.role
          else excluded.role
        end,
        updated_at = now();
    `,
    [documentId, targetUserId, role]
  );
}

/**
 * @param {object} p
 * @param {string} p.ownerUserId
 * @param {string} p.documentId
 * @param {string} p.targetUserId  users.id
 * @param {'editor'|'viewer'} p.role
 */
async function addDocumentMemberByUserId({ ownerUserId, documentId, targetUserId, role }) {
  if (role !== 'editor' && role !== 'viewer') {
    const e = new Error('invalid_role');
    e.statusCode = 400;
    throw e;
  }

  const pool = getPool();
  const ownerPk = await assertOwner(pool, ownerUserId, documentId);
  if (targetUserId === ownerPk) {
    throw clientError('cannot_invite_owner', 'That person is already the document owner.');
  }

  const exists = await pool.query(`select 1 from users where id = $1`, [targetUserId]);
  if (!exists.rows.length) {
    throw clientError('user_not_found', 'User not found.');
  }

  await insertMember(pool, documentId, targetUserId, role);
  void notifyUserDocumentMembership({ recipientUserId: targetUserId, documentId, role });
  return { status: 'member_added', userId: targetUserId };
}

/**
 * @param {object} p
 * @param {string} p.ownerUserId
 * @param {string} p.documentId
 * @param {string} p.targetClerkUserId
 * @param {'editor'|'viewer'} p.role
 */
async function addDocumentMemberByClerkId({ ownerUserId, documentId, targetClerkUserId, role }) {
  if (role !== 'editor' && role !== 'viewer') {
    const e = new Error('invalid_role');
    e.statusCode = 400;
    throw e;
  }
  if (!targetClerkUserId || typeof targetClerkUserId !== 'string') {
    throw clientError('invalid_clerk_user', 'Invalid user selection.');
  }

  const pool = getPool();
  const ownerRow = await pool.query(
    `
      select d.owner_user_id, u.clerk_user_id as owner_clerk_id
      from documents d
      join users u on u.id = d.owner_user_id
      where d.id = $1 and d.archived_at is null;
    `,
    [documentId]
  );
  if (!ownerRow.rows.length) {
    const e = new Error('not_found');
    e.statusCode = 404;
    throw e;
  }
  if (ownerRow.rows[0].owner_user_id !== ownerUserId) {
    throw forbidden();
  }
  if (ownerRow.rows[0].owner_clerk_id === targetClerkUserId) {
    throw clientError('cannot_invite_self', 'You’re already the owner of this document.');
  }

  let tRow = await pool.query(`select id from users where clerk_user_id = $1`, [targetClerkUserId]);
  if (!tRow.rows.length) {
    const clerk = getClerkBackend();
    if (!clerk) {
      throw clientError(
        'clerk_required',
        'This user has not signed in yet. Set CLERK_SECRET_KEY on the server to add them from the directory.'
      );
    }
    let u;
    try {
      u = await clerk.users.getUser(targetClerkUserId);
    } catch {
      throw clientError('user_not_found', 'Could not load that user from Clerk.');
    }
    const prof = clerkUserToProfile(u);
    await upsertUserByClerkId({
      clerkUserId: prof.clerkUserId,
      email: prof.email,
      name: prof.name,
      avatarUrl: prof.avatarUrl,
    });
    tRow = await pool.query(`select id from users where clerk_user_id = $1`, [targetClerkUserId]);
  }

  const targetId = tRow.rows[0].id;
  if (targetId === ownerRow.rows[0].owner_user_id) {
    throw clientError('cannot_invite_owner', 'That person is already the document owner.');
  }

  await insertMember(pool, documentId, targetId, role);
  void notifyUserDocumentMembership({ recipientUserId: targetId, documentId, role });
  return { status: 'member_added', userId: targetId };
}

export { addDocumentMemberByUserId, addDocumentMemberByClerkId };

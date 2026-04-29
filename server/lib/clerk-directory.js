/**
 * Lazy Clerk Backend client for directory search (getUserList) and user hydration.
 * Requires CLERK_SECRET_KEY (same instance as frontend Clerk app).
 */

import { createClerkClient } from '@clerk/backend';

let client = null;

export function getClerkBackend() {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) return null;
  if (!client) {
    client = createClerkClient({ secretKey: key });
  }
  return client;
}

/** Map a Clerk `User` from the Backend API to our profile shape. */
export function clerkUserToProfile(u) {
  const emails = u.emailAddresses || [];
  const primaryId = u.primaryEmailAddressId;
  const primary = emails.find((e) => e.id === primaryId) || emails[0];
  const name =
    u.fullName ||
    [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
    u.username ||
    null;
  return {
    clerkUserId: u.id,
    email: primary?.emailAddress ?? null,
    name: name || null,
    avatarUrl: u.imageUrl ?? null,
  };
}

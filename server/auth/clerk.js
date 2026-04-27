// PREVIOUS IMPLEMENTATION (commented out):
// - Server was CommonJS (`require`/`module.exports`), but `jose@6` is ESM-only.
// - Attempted workarounds: dynamic `import()` + crypto polyfill, which caused "crypto is not defined" errors.
//
// Reason for change:
// - Convert entire server to ESM (`"type": "module"` in package.json) so `jose` works natively.
// - However, `jose` v6 requires `globalThis.crypto` (Web Crypto API), which Node.js 18 exposes via `crypto.webcrypto`.
//   In some Docker/Alpine environments, `globalThis.crypto` isn't set automatically, so we polyfill it before importing `jose`.
//
// const { createRemoteJWKSet, jwtVerify } = require('jose');
// ... crypto polyfill hacks ...

import crypto from 'crypto';

// Ensure Web Crypto API is available globally for jose (Node.js 18+)
// In Node.js 18+, crypto.webcrypto exists but globalThis.crypto might not be set in all environments.
if (!globalThis.crypto) {
  globalThis.crypto = crypto.webcrypto;
}

import { createRemoteJWKSet, jwtVerify } from 'jose';

let jwks;

function getJwks() {
  if (!jwks) {
    const jwksUrl = process.env.CLERK_JWKS_URL;
    if (!jwksUrl) {
      throw new Error('Missing CLERK_JWKS_URL');
    }
    jwks = createRemoteJWKSet(new URL(jwksUrl));
  }
  return jwks;
}

export async function verifyClerkJwt(token) {
  const issuer = process.env.CLERK_ISSUER;
  const audience = process.env.CLERK_AUDIENCE;

  const options = {};
  if (issuer) options.issuer = issuer;
  if (audience) options.audience = audience;

  const { payload } = await jwtVerify(token, getJwks(), options);
  return payload;
}

/**
 * Map a verified Clerk JWT payload to our internal user profile shape.
 *
 * The expected session-token template (configured in the Clerk dashboard) is:
 *   {
 *     "email":      "{{user.primary_email_address}}",
 *     "name":       "{{user.full_name}}",
 *     "first_name": "{{user.first_name}}",
 *     "last_name":  "{{user.last_name}}",
 *     "image_url":  "{{user.image_url}}"
 *   }
 *
 * We accept several common alias claim names so this code keeps working if the
 * template is renamed, or if a different template (e.g. OIDC-style
 * `given_name`/`family_name`/`picture`) is used.
 */
export function claimsToProfile(payload) {
  const clerkUserId = payload.sub;

  const email =
    payload.email ||
    payload.email_address ||
    (Array.isArray(payload.email_addresses) ? payload.email_addresses[0] : undefined) ||
    null;

  const fullFromParts = [
    payload.first_name || payload.given_name,
    payload.last_name || payload.family_name,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  const name =
    payload.name ||
    payload.full_name ||
    (fullFromParts.length > 0 ? fullFromParts : null) ||
    payload.username ||
    null;

  const avatarUrl =
    payload.image_url ||
    payload.picture ||
    payload.avatar_url ||
    null;

  return {
    clerkUserId,
    email,
    name,
    avatarUrl,
  };
}


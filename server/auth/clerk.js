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

export function claimsToProfile(payload) {
  const clerkUserId = payload.sub;
  const email =
    payload.email ||
    payload.email_address ||
    (Array.isArray(payload.email_addresses) ? payload.email_addresses[0] : undefined);

  const name =
    payload.name ||
    [payload.given_name, payload.family_name].filter(Boolean).join(' ') ||
    payload.username ||
    null;

  const avatarUrl = payload.picture || payload.avatar_url || null;

  return {
    clerkUserId,
    email: email || null,
    name,
    avatarUrl,
  };
}


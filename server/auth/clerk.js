// PREVIOUS IMPLEMENTATION (commented out):
// - Imported `jose` via `require()` in a CommonJS module.
//
// Reason for change:
// - `jose@6` is ESM-only. When deployed (Fly/Docker), Node throws:
//   "Error [ERR_REQUIRE_ESM]: require() of ES Module .../jose/... not supported."
// - We keep the server as CommonJS and load `jose` via dynamic `import()` (supported in CJS).
//
// const { createRemoteJWKSet, jwtVerify } = require('jose');

let joseModulePromise;

async function getJose() {
  if (!joseModulePromise) {
    joseModulePromise = import('jose');
  }
  return joseModulePromise;
}

let jwks;

async function getJwks() {
  if (!jwks) {
    const jwksUrl = process.env.CLERK_JWKS_URL;
    if (!jwksUrl) {
      throw new Error('Missing CLERK_JWKS_URL');
    }
    const { createRemoteJWKSet } = await getJose();
    jwks = createRemoteJWKSet(new URL(jwksUrl));
  }
  return jwks;
}

async function verifyClerkJwt(token) {
  const issuer = process.env.CLERK_ISSUER;
  const audience = process.env.CLERK_AUDIENCE;

  const options = {};
  if (issuer) options.issuer = issuer;
  if (audience) options.audience = audience;

  const { jwtVerify } = await getJose();
  const { payload } = await jwtVerify(token, await getJwks(), options);
  return payload;
}

function claimsToProfile(payload) {
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

module.exports = { verifyClerkJwt, claimsToProfile };


const { createRemoteJWKSet, jwtVerify } = require('jose');

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

async function verifyClerkJwt(token) {
  const issuer = process.env.CLERK_ISSUER;
  const audience = process.env.CLERK_AUDIENCE;

  const options = {};
  if (issuer) options.issuer = issuer;
  if (audience) options.audience = audience;

  const { payload } = await jwtVerify(token, getJwks(), options);
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


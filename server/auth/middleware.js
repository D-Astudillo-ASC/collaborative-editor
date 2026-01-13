const { getBearerToken } = require('../utils/http');
const { verifyClerkJwt, claimsToProfile } = require('./clerk');
const { upsertUserByClerkId } = require('../db/users');

async function requireClerkAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) return res.sendStatus(401);

    const payload = await verifyClerkJwt(token);
    const profile = claimsToProfile(payload);

    const user = await upsertUserByClerkId(profile);
    req.auth = { clerk: { payload } };
    req.user = {
      id: user.id,
      clerkUserId: user.clerk_user_id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url,
    };
    next();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Auth failed:', e?.message || e);
    res.sendStatus(403);
  }
}

function socketClerkAuth() {
  return async (socket, next) => {
    try {
      const token =
        socket.handshake?.auth?.token ||
        (() => {
          const h = socket.handshake?.headers?.authorization;
          if (!h) return null;
          const parts = String(h).split(' ');
          if (parts.length === 2 && /^Bearer$/i.test(parts[0])) return parts[1];
          return null;
        })();

      // PREVIOUS IMPLEMENTATION (commented out):
      // - Rejected sockets without a Clerk JWT.
      //
      // Reason for change:
      // - Share links should be able to authorize via link token even when the user isn't signed in.
      //   In that case, we allow the socket to connect with `socket.data.user = null` and authorize in `join-document`.
      //
      // if (!token) return next(new Error('unauthorized'));

      // Option B (requested):
      // - Documents must be accessible only to authenticated users, even via share tokens.
      // - Therefore sockets must always present a valid Clerk JWT.
      if (!token) return next(new Error('unauthorized'));

      const payload = await verifyClerkJwt(token);
      const profile = claimsToProfile(payload);
      const user = await upsertUserByClerkId(profile);

      socket.data.user = {
        id: user.id,
        clerkUserId: user.clerk_user_id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
      };
      socket.data.clerk = { payload };
      return next();
    } catch (e) {
      return next(new Error('unauthorized'));
    }
  };
}

module.exports = { requireClerkAuth, socketClerkAuth };


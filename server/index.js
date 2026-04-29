import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import * as Y from 'yjs';
import dotenv from 'dotenv';

dotenv.config();

// Parse FRONTEND_URL as a comma-separated allowlist so both local dev
// (http://localhost:3000) and the Vercel production domain can be set
// via a single env var: FRONTEND_URL=https://myapp.vercel.app,http://localhost:3000
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

app.use(
  cors({
    origin: (origin, callback) => {
      // No origin = same-origin request, curl, health-check pings — allow.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not in allowlist`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

// Phase 8: AI assistant routes
app.use('/api/ai', aiRouter);

import { migrate } from './db/migrate.js';
import { requireClerkAuth, socketClerkAuth } from './auth/middleware.js';
import {
  listDocumentsForUser,
  createDocumentForUser,
  validateLinkToken,
  rotateShareLink,
  getMemberRole,
  getDocumentMetaForAccess,
  updateDocumentMeta,
  listDocumentMembersAndInvites,
  updateDocumentMemberRole,
  removeDocumentMember,
} from './db/documents.js';
import { listFoldersForUser, createFolderForUser } from './db/folders.js';
import { getDocumentState, fetchUpdatesAfter, appendUpdate, markSnapshot } from './db/updates.js';
import {
  listMessages,
  insertMessage,
  updateMessage,
  softDeleteMessage,
  MAX_CONTENT_CHARS,
} from './db/chat.js';
import { downloadSnapshotBytes, uploadSnapshot } from './r2/snapshots.js';
import { validateCode } from './execution/executor.js';
import { executionQueue } from './execution/queue.js';
import aiRouter from './ai.js';
import { chatLimiter, inviteMemberLimiter, userSearchLimiter } from './lib/rate-limiter.js';
import { normalizeUserText } from './lib/text.js';
import { searchShareDirectory } from './db/share-directory.js';
import { addDocumentMemberByUserId, addDocumentMemberByClerkId } from './db/document-members.js';
import { createAccessRequest, resolveAccessRequest } from './db/access-requests.js';
import {
  listNotificationsForUser,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotificationForUser,
  deleteAllNotificationsForUser,
} from './db/notifications.js';

/*
PREVIOUS IMPLEMENTATION (commented out):
- Used an in-memory Map for documents + metadata.
- Used a local JWT secret for REST auth, and sockets were unauthenticated.

Reason for change:
- We need Neon Postgres as source of truth, and Clerk JWTs for auth so the server can authorize doc access and persist Yjs updates.

// const jwt = require('jsonwebtoken');
// const documents = new Map();
// const documentMetadata = new Map();
//
// const authenticateToken = (req, res, next) => {
//   const authHeader = req.headers['authorization'];
//   const token = authHeader && authHeader.split(' ')[1];
//
//   if (!token) return res.sendStatus(401);
//
//   jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret', (err, user) => {
//     if (err) return res.sendStatus(403);
//     req.user = user;
//     next();
//   });
// };
*/

function canEdit(role) {
  return role === 'owner' || role === 'editor';
}

function snapshotConfig() {
  return {
    everyN: Number(process.env.SNAPSHOT_EVERY_N_UPDATES || 50),
    everyMs: Number(process.env.SNAPSHOT_EVERY_MS || 30_000),
    prune: String(process.env.PRUNE_UPDATES_BEFORE_SNAPSHOT || 'false') === 'true',
  };
}

// In-memory Y.Doc cache for snapshotting.
// Reason: snapshots require a materialized Y.Doc state; we keep a best-effort cache and rebuild it from
// (snapshot + tail updates) on first use after server restart.
const docCache = new Map();

function getOrCreateDocCache(documentId) {
  if (!docCache.has(documentId)) {
    docCache.set(documentId, {
      doc: new Y.Doc(),
      loaded: false,
      loadPromise: null,
      lastSeqApplied: 0,
      lastSnapshotSeq: 0,
      pendingUpdates: 0,
      lastSnapshotAt: Date.now(),
    });
  }
  return docCache.get(documentId);
}

async function ensureCacheLoaded(documentId) {
  const cache = getOrCreateDocCache(documentId);
  if (cache.loaded) return cache;
  if (cache.loadPromise) return cache.loadPromise;

  cache.loadPromise = (async () => {
    // PREVIOUS IMPLEMENTATION (commented out):
    // - Cache always started from an empty Y.Doc, so after a server restart snapshotting could produce incorrect state.
    //
    // Reason for change:
    // - We rebuild cache from latest snapshot + tail updates so snapshotting remains correct across restarts.
    //
    // cache.doc = new Y.Doc();
    const state = await getDocumentState(documentId);
    const snapshotSeq = state?.latestSnapshotSeq ? Number(state.latestSnapshotSeq) : 0;

    let snapshotBytes = null;
    if (state?.latestSnapshotR2Key) {
      snapshotBytes = await downloadSnapshotBytes({ key: state.latestSnapshotR2Key });
    }

    const doc = new Y.Doc();
    if (snapshotBytes) {
      Y.applyUpdate(doc, snapshotBytes, 'remote');
    } else if (snapshotSeq > 0) {
      // Snapshot pointer exists but couldn't be downloaded; cache rebuild may be incomplete if updates were pruned.
      console.warn(
        `⚠️ Snapshot key present but download failed for ${documentId} at seq ${snapshotSeq}. ` +
        `If updates were pruned, cache rebuild will be incomplete.`
      );
    }

    const updates = await fetchUpdatesAfter({
      documentId,
      afterSeq: snapshotBytes ? snapshotSeq : 0,
    });
    for (const u of updates) {
      Y.applyUpdate(doc, u.update, 'remote');
    }

    cache.doc = doc;
    cache.lastSnapshotSeq = snapshotBytes ? snapshotSeq : 0;
    cache.lastSeqApplied = updates.length ? Number(updates[updates.length - 1].seq) : cache.lastSnapshotSeq;
    cache.pendingUpdates = 0;
    cache.lastSnapshotAt = Date.now();
    cache.loaded = true;
    cache.loadPromise = null;
    return cache;
  })();

  return cache.loadPromise;
}

io.use(socketClerkAuth());

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('New client connected, socket ID:', socket.id);

  // CRITICAL: Error boundary for socket events - prevents errors from disconnecting users
  const safeEmit = (event, data) => {
    try {
      socket.emit(event, data);
    } catch (error) {
      console.error(`[WebSocket] Error emitting ${event}:`, error.message);
      // Don't throw - keep connection alive
    }
  };

  // CRITICAL: Wrap socket event handlers to catch errors
  const wrapHandler = (handler) => {
    return async (...args) => {
      try {
        await handler(...args);
      } catch (error) {
        console.error('[WebSocket] Unhandled error in socket handler:', error);
        console.error('[WebSocket] Error stack:', error.stack);
        // Emit error to client but keep connection alive
        safeEmit('error', {
          message: 'An error occurred. Your connection is still active.',
          type: 'handler_error'
        });
        // Don't rethrow - keep WebSocket connection alive
      }
    };
  };

  /*
  PREVIOUS IMPLEMENTATION (commented out):
  - join-document accepted only a documentId string
  - created a new Y.Doc in memory and sent full string content via `document-content`
  - no DB persistence, no authorization beyond “anyone can join”

  Reason for change:
  - We need server-side authorization + persisted CRDT updates (append-only) so clients can fast-join and we can later add snapshots/version history.

  // socket.on('join-document', (documentId) => {
  //   socket.join(documentId);
  //   if (!documents.has(documentId)) {
  //     const yDoc = new Y.Doc();
  //     documents.set(documentId, yDoc);
  //     documentMetadata.set(documentId, {
  //       title: `Document ${documentId}`,
  //       lastModified: new Date().toISOString(),
  //       createdBy: 'unknown'
  //     });
  //   }
  //   const yDoc = documents.get(documentId);
  //   if (yDoc) {
  //     const yText = yDoc.getText('content');
  //     socket.emit('document-content', { documentId, content: yText.toString() });
  //   }
  // });
  */

  socket.on('join-document', wrapHandler(async (payload) => {
    const documentId = typeof payload === 'string' ? payload : payload?.documentId;
    const linkToken = typeof payload === 'object' ? payload?.linkToken : null;

    if (!documentId) {
      safeEmit('error', { message: 'missing_documentId' });
      return;
    }

    try {
      // PREVIOUS IMPLEMENTATION (commented out):
      // - Always required a signed-in user (socket auth middleware rejected missing JWT) and checked membership first.
      //
      // Reason for change:
      // - With share links, sockets may be unauthenticated; in that case membership lookup is skipped and linkToken is required.
      //
      // const user = socket.data.user;
      // let role = await getMemberRole({ userId: user.id, documentId });
      // if (!role) role = await validateLinkToken({ documentId, token: linkToken });

      const user = socket.data.user;
      let role = null;
      // Option B: socket auth requires Clerk JWT, so `user` must exist here.
      role = await getMemberRole({ userId: user.id, documentId });
      if (!role) role = await validateLinkToken({ documentId, token: linkToken });
      if (!role) {
        safeEmit('error', { message: 'forbidden' });
        return;
      }

      socket.join(documentId);
      if (!socket.data.docs) socket.data.docs = {};
      socket.data.docs[documentId] = { role };

      // Ask existing clients to resend awareness state so the new client sees their cursors.
      // (Awareness is ephemeral/in-memory and not persisted.)
      socket.to(documentId).emit('awareness-request', { documentId });

      const state = await getDocumentState(documentId);
      const snapshotSeq = state?.latestSnapshotSeq ? Number(state.latestSnapshotSeq) : 0;

      // PREVIOUS IMPLEMENTATION (commented out):
      // - Always sent snapshot: null and replayed from seq 0.
      //
      // Reason for change:
      // - Once snapshotting is enabled, we send the latest snapshot (if any) and replay only tail updates after snapshotSeq.
      //
      // const updates = await fetchUpdatesAfter({ documentId, afterSeq: 0 });
      // socket.emit('doc-init', { documentId, snapshot: null, snapshotSeq: 0, updates: updates.map(...) });

      let snapshot = state?.latestSnapshotR2Key
        ? await downloadSnapshotBytes({ key: state.latestSnapshotR2Key })
        : null;

      // If snapshotSeq is set but bytes can't be fetched, fall back to full replay (best effort).
      // PREVIOUS IMPLEMENTATION (commented out):
      // - Assumed snapshot download always succeeds.
      //
      // Reason for change:
      // - B2/R2 may be unconfigured or temporarily unavailable; we prefer full replay to sending an unusable snapshotSeq.
      //
      // const updates = await fetchUpdatesAfter({ documentId, afterSeq: snapshotSeq });
      let effectiveSnapshotSeq = snapshotSeq;
      if (!snapshot && snapshotSeq > 0) {
        effectiveSnapshotSeq = 0;
      }

      const updates = await fetchUpdatesAfter({ documentId, afterSeq: effectiveSnapshotSeq });

      safeEmit('doc-init', {
        documentId,
        snapshot,
        snapshotSeq: effectiveSnapshotSeq,
        updates: updates.map((u) => ({ seq: u.seq, update: u.update })),
        role,
      });

      const room = io.sockets.adapter.rooms.get(documentId);
      // CRITICAL: Map socket IDs to Clerk user IDs for proper matching with awareness states
      const activeUsers = Array.from(room || [])
        .map((socketId) => {
          const socket = io.sockets.sockets.get(socketId);
          const user = socket?.data?.user;
          // Use Clerk user ID if available, otherwise fall back to socket ID
          return {
            userId: user?.clerkUserId || user?.id || socketId,
            socketId: socketId, // Keep socket ID for reference
            userName: user?.name || `User ${socketId.slice(0, 6)}`,
          };
        })
        .filter((u) => u.userId); // Only include users with valid IDs

      // CRITICAL: Send Clerk user ID instead of socket ID for proper matching with awareness states
      // Reuse the existing `user` variable declared on line 224
      const userId = user?.clerkUserId || user?.id || socket.id;
      socket.to(documentId).emit('user-joined', {
        userId: userId,
        socketId: socket.id, // Keep socket ID for reference
        userName: user?.name || `User ${socket.id.slice(0, 6)}`,
        timestamp: Date.now(),
      });
      safeEmit('active-users', activeUsers);
    } catch (e) {
      console.error('join-document failed:', e);
      safeEmit('error', { message: 'join_failed' });
    }
  }));

  // Realtime cursor/selection presence (Yjs awareness protocol)
  socket.on('awareness-update', wrapHandler((data) => {
    const documentId = data?.documentId;
    const update = data?.update;
    if (!documentId || !update) return;
    const docInfo = socket.data.docs?.[documentId];
    if (!docInfo) return;

    // Relay to all other clients in the document room.
    try {
      socket.to(documentId).emit('awareness-update', { documentId, update });
    } catch (error) {
      console.error('[WebSocket] Error relaying awareness-update:', error.message);
    }
  }));

  /*
  PREVIOUS IMPLEMENTATION (commented out):
  - update-document replaced full text content in a Y.Text and broadcasted `document-updated` with the whole string

  Reason for change:
  - We need to relay/persist binary Yjs updates (smaller + correct concurrency), not whole strings.

  // socket.on('update-document', (data) => {
  //   const { documentId, content, userId } = data;
  //   let yDoc = documents.get(documentId);
  //   if (!yDoc) {
  //     yDoc = new Y.Doc();
  //     documents.set(documentId, yDoc);
  //   }
  //   const yText = yDoc.getText('content');
  //   yText.delete(0, yText.length);
  //   yText.insert(0, content);
  //   socket.to(documentId).emit('document-updated', { documentId, content, userId: userId || socket.id, timestamp: Date.now() });
  // });
  */

  socket.on('yjs-update', wrapHandler(async (data) => {
    const startTime = Date.now();
    const documentId = data?.documentId;
    const update = data?.update;

    if (!documentId || !update) return;
    const docInfo = socket.data.docs?.[documentId];
    if (!docInfo) return;
    if (!canEdit(docInfo.role)) return;

    try {
      const seq = await appendUpdate({
        documentId,
        // actor_user_id is nullable; unauthenticated share-link editors will write null here.
        actorUserId: socket.data.user?.id || null,
        updateBytes: update,
      });

      // Apply to in-memory cache for snapshotting (best effort).
      const cache = await ensureCacheLoaded(documentId);
      try {
        Y.applyUpdate(cache.doc, Buffer.from(update), 'remote');
        cache.lastSeqApplied = Math.max(cache.lastSeqApplied, seq);
        cache.pendingUpdates += 1;
      } catch (e) {
        // If a client sent a bad update, we still persisted it; snapshotting may fail until cache is rebuilt.
        console.warn('⚠️ Failed applying update to cache:', e?.message || e);
      }

      try {
        socket.to(documentId).emit('yjs-update', {
          documentId,
          seq,
          update,
        });
      } catch (error) {
        console.error('[WebSocket] Error emitting yjs-update:', error.message);
        // Don't throw - keep connection alive
      }

      // Snapshotting policy (best effort, only when bucket is configured)
      const cfg = snapshotConfig();
      const now = Date.now();
      const shouldSnapshot =
        cache.pendingUpdates >= cfg.everyN || now - cache.lastSnapshotAt >= cfg.everyMs;

      if (shouldSnapshot && process.env.R2_BUCKET && process.env.R2_ENDPOINT) {
        try {
          const snapshotBytes = Y.encodeStateAsUpdate(cache.doc);
          const key = await uploadSnapshot({ documentId, seq, bytes: snapshotBytes });
          if (key) {
            await markSnapshot({
              documentId,
              snapshotSeq: seq,
              r2Key: key,
              pruneUpdatesBeforeSnapshot: cfg.prune,
            });
            cache.lastSnapshotSeq = seq;
            cache.pendingUpdates = 0;
            cache.lastSnapshotAt = now;
          }
        } catch (e) {
          console.warn('⚠️ Snapshot failed (continuing without snapshot):', e?.message || e);
        }
      }

      const processingTime = Date.now() - startTime;
      if (!global.updateStats) {
        global.updateStats = { totalUpdates: 0, totalLatency: 0, errors: 0 };
      }
      global.updateStats.totalUpdates++;
      global.updateStats.totalLatency += processingTime;
    } catch (e) {
      console.error('yjs-update failed:', e);
      if (global.updateStats) global.updateStats.errors++;
      // Don't throw - keep WebSocket connection alive
      // Error is logged but connection remains active
    }
  }));

  /*
  PREVIOUS IMPLEMENTATION (commented out):
  - `send-message` / `message-received` / `typing-start` / `typing-stop` were ephemeral —
    messages were broadcast to the room but never persisted.

  Reason for change (Phase 7):
  - Document chat is now persisted in the `chat_messages` table so users see history when
    they reopen a document. The websocket events were renamed to `chat:*` to make the
    contract explicit and to leave the legacy events available if any old client connects.
  */

  // Per-user sliding-window rate limit for chat sends, backed by Redis.
  // Lives in lib/rate-limiter.js — keyed on the DB user id, so multiple tabs
  // from the same user share the same budget.
  socket.on('chat:send', wrapHandler(async (data) => {
    const documentId = data?.documentId;
    const clientId = typeof data?.clientId === 'string' ? data.clientId : null;
    const content = typeof data?.content === 'string' ? data.content : '';
    // Phase 2 additions — both optional. Parent linkage is validated against
    // the document inside the SQL itself (see db/chat.js insertMessage), and
    // mentions are resolved server-side against the users table so a malicious
    // client can't fabricate a "mention" that lights up an arbitrary span.
    const parentId = typeof data?.parentId === 'string' ? data.parentId : null;
    const mentions = Array.isArray(data?.mentions) ? data.mentions : [];

    if (!documentId) return;
    const docInfo = socket.data.docs?.[documentId];
    if (!docInfo) {
      safeEmit('chat:error', { clientId, message: 'not_in_document' });
      return;
    }

    // Chat is intentionally available to viewers as well — chat is collaboration
    // UX, not document-edit. (Decision: Phase 7 design review.)
    const user = socket.data.user;
    if (!user?.id) {
      safeEmit('chat:error', { clientId, message: 'unauthenticated' });
      return;
    }

    // Normalize before any other processing so the rate limit / length check
    // operate on what we are actually going to store.
    const { value: normalized, truncated } = normalizeUserText(content, {
      max: MAX_CONTENT_CHARS,
    });
    if (!normalized) return;
    if (truncated) {
      safeEmit('chat:error', { clientId, message: 'content_too_long' });
      return;
    }

    const limit = await chatLimiter.check(user.id);
    if (!limit.allowed) {
      safeEmit('chat:error', { clientId, message: 'rate_limited' });
      return;
    }

    try {
      const message = await insertMessage({
        documentId,
        userId: user.id,
        clientId,
        content: normalized,
        parentId,
        mentions,
        senderClerkId: user.clerkUserId ?? null,
      });

      io.to(documentId).emit('chat:message', message);
    } catch (e) {
      console.error('[chat:send] persist failed:', e?.message || e);
      safeEmit('chat:error', { clientId, message: 'persist_failed' });
    }
  }));

  // Edit an own, non-deleted message that's still inside the 15-min window.
  // The window + ownership are enforced in SQL so this handler is just plumbing.
  socket.on('chat:edit', wrapHandler(async (data) => {
    const documentId = data?.documentId;
    const messageId = data?.messageId;
    const content = typeof data?.content === 'string' ? data.content : '';

    if (!documentId || !messageId) return;
    const docInfo = socket.data.docs?.[documentId];
    if (!docInfo) {
      safeEmit('chat:error', { messageId, message: 'not_in_document' });
      return;
    }

    const user = socket.data.user;
    if (!user?.id) {
      safeEmit('chat:error', { messageId, message: 'unauthenticated' });
      return;
    }

    const { value: normalized, truncated } = normalizeUserText(content, {
      max: MAX_CONTENT_CHARS,
    });
    if (!normalized) {
      // Empty edit — caller should use chat:delete instead. We don't want to
      // silently turn an edit into a delete because that would surprise the UI.
      safeEmit('chat:error', { messageId, message: 'empty_content' });
      return;
    }
    if (truncated) {
      safeEmit('chat:error', { messageId, message: 'content_too_long' });
      return;
    }

    const limit = await chatLimiter.check(user.id);
    if (!limit.allowed) {
      safeEmit('chat:error', { messageId, message: 'rate_limited' });
      return;
    }

    try {
      const updated = await updateMessage({
        messageId,
        userId: user.id,
        content: normalized,
      });
      if (!updated) {
        // Either the user isn't the owner, the message is already deleted,
        // or the 15-minute window has passed. We surface a single error
        // because we don't want to leak which one to a malicious client.
        safeEmit('chat:error', { messageId, message: 'edit_forbidden' });
        return;
      }
      io.to(documentId).emit('chat:message:updated', updated);
    } catch (e) {
      console.error('[chat:edit] update failed:', e?.message || e);
      safeEmit('chat:error', { messageId, message: 'persist_failed' });
    }
  }));

  // Soft-delete an own message inside the 15-min window. Same auth gate as edit.
  socket.on('chat:delete', wrapHandler(async (data) => {
    const documentId = data?.documentId;
    const messageId = data?.messageId;

    if (!documentId || !messageId) return;
    const docInfo = socket.data.docs?.[documentId];
    if (!docInfo) {
      safeEmit('chat:error', { messageId, message: 'not_in_document' });
      return;
    }

    const user = socket.data.user;
    if (!user?.id) {
      safeEmit('chat:error', { messageId, message: 'unauthenticated' });
      return;
    }

    // Apply the same per-user limiter — a runaway "delete all" loop would
    // otherwise be cheap to weaponize.
    const limit = await chatLimiter.check(user.id);
    if (!limit.allowed) {
      safeEmit('chat:error', { messageId, message: 'rate_limited' });
      return;
    }

    try {
      const deleted = await softDeleteMessage({
        messageId,
        userId: user.id,
      });
      if (!deleted) {
        safeEmit('chat:error', { messageId, message: 'delete_forbidden' });
        return;
      }
      // We ship the full row (with content blanked + deletedAt set) so every
      // client can reconcile the same state, including reply-quote previews
      // pointing at this message.
      io.to(documentId).emit('chat:message:deleted', {
        messageId: deleted.id,
        documentId: deleted.documentId,
        deletedAt: deleted.deletedAt,
      });
    } catch (e) {
      console.error('[chat:delete] delete failed:', e?.message || e);
      safeEmit('chat:error', { messageId, message: 'persist_failed' });
    }
  }));

  // Ephemeral typing indicator. Not persisted.
  socket.on('chat:typing', wrapHandler((data) => {
    const documentId = data?.documentId;
    const isTyping = !!data?.isTyping;
    if (!documentId) return;
    const docInfo = socket.data.docs?.[documentId];
    if (!docInfo) return;

    const user = socket.data.user;
    if (!user?.id) return;

    try {
      // We emit the stable Clerk id alongside the internal users.id so clients
      // can self-filter against their own Clerk user object (the only id the
      // frontend reliably has). userName is best-effort and may be null when
      // a user hasn't synced their profile yet — clients handle the fallback.
      socket.to(documentId).emit('chat:typing', {
        documentId,
        userId: user.id,
        userClerkId: user.clerkUserId,
        userName: user.name || null,
        userAvatarUrl: user.avatarUrl || null,
        isTyping,
      });
    } catch (error) {
      console.error('[WebSocket] Error emitting chat:typing:', error.message);
    }
  }));

  // GOOGLE-LEVEL: Handle granular operations for advanced collaboration
  socket.on('document-operation', wrapHandler((data) => {
    const { documentId, operation, userId } = data;
    console.log(`Client ${socket.id} operation:`, operation.type, 'at position:', operation.position);

    // Broadcast operation to other clients in the same document room
    try {
      socket.to(documentId).emit('document-operation', {
        documentId,
        operation,
        userId: userId || socket.id,
        timestamp: Date.now()
      });
      console.log(`Broadcasted operation to other clients in document: ${documentId}`);
    } catch (error) {
      console.error('[WebSocket] Error emitting document-operation:', error.message);
    }
  }));

  socket.on('cursor-position', wrapHandler((data) => {
    const { documentId, position, userId, userName, color } = data;
    console.log(`Client ${socket.id} cursor position:`, position, 'User:', userName);

    // Broadcast cursor position to other clients in the same document
    try {
      socket.to(documentId).emit('cursor-updated', {
        userId: userId || socket.id, // Use provided userId or fallback to socket.id
        userName: userName || `User ${socket.id.slice(0, 6)}`,
        position,
        color: color || '#ff0000',
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[WebSocket] Error emitting cursor-updated:', error.message);
    }
  }));

  socket.on('content-change', wrapHandler((data) => {
    const { documentId, content, userId, userName, color } = data;
    console.log(`Client ${socket.id} content change from user:`, userName);

    // Broadcast content change to other clients in the same document
    try {
      socket.to(documentId).emit('content-change', {
        documentId,
        content,
        userId: userId || socket.id,
        userName: userName || `User ${socket.id.slice(0, 6)}`,
        color: color || '#ff0000',
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[WebSocket] Error emitting content-change:', error.message);
    }
  }));

  socket.on('selection-change', wrapHandler((data) => {
    const { documentId, selection, userId, userName, color } = data;
    console.log(`Client ${socket.id} selection change:`, selection, 'User:', userName);

    // Broadcast selection change to other clients in the same document
    try {
      socket.to(documentId).emit('selection-change', {
        userId: userId || socket.id,
        userName: userName || `User ${socket.id.slice(0, 6)}`,
        selection,
        color: color || '#ff0000',
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[WebSocket] Error emitting selection-change:', error.message);
    }
  }));

  socket.on('disconnect', wrapHandler(() => {
    console.log('Client disconnected, socket ID:', socket.id);
  }));

  socket.on('leave-document', wrapHandler((documentId) => {
    try {
      socket.leave(documentId);
      console.log(`Client ${socket.id} left document: ${documentId}`);

      // Get room info after leaving
      const room = io.sockets.adapter.rooms.get(documentId);
      const clientCount = room ? room.size : 0;
      console.log(`Room ${documentId} now has ${clientCount} clients`);

      // Notify other users about user leaving
      // CRITICAL: Send Clerk user ID instead of socket ID for proper matching with awareness states
      const user = socket.data?.user;
      const userId = user?.clerkUserId || user?.id || socket.id;
      socket.to(documentId).emit('user-left', {
        userId: userId,
        socketId: socket.id, // Keep socket ID for reference
        userName: user?.name || `User ${socket.id.slice(0, 6)}`,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[WebSocket] Error in leave-document:', error.message);
    }
  }));

  socket.on('get-active-users', wrapHandler((documentId) => {
    try {
      const room = io.sockets.adapter.rooms.get(documentId);
      if (room) {
        // CRITICAL: Map socket IDs to Clerk user IDs for proper matching with awareness states
        const activeUsers = Array.from(room)
          .map((socketId) => {
            const socketInstance = io.sockets.sockets.get(socketId);
            const user = socketInstance?.data?.user;
            // Use Clerk user ID if available, otherwise fall back to socket ID
            return {
              userId: user?.clerkUserId || user?.id || socketId,
              socketId: socketId, // Keep socket ID for reference
              userName: user?.name || `User ${socketId.slice(0, 6)}`,
            };
          })
          .filter((u) => u.userId); // Only include users with valid IDs
        console.log(`Sending active users for document ${documentId}:`, activeUsers);
        safeEmit('active-users', activeUsers);
      } else {
        console.log(`No room found for document ${documentId}`);
        safeEmit('active-users', []);
      }
    } catch (error) {
      console.error('[WebSocket] Error in get-active-users:', error.message);
      safeEmit('active-users', []);
    }
  }));
});

// API Routes
/*
PREVIOUS IMPLEMENTATION (commented out):
- POST /api/login issued a local JWT for a test user.

Reason for change:
- Auth is now Clerk-based; the frontend should send Clerk session JWTs and the backend verifies via Clerk JWKS.

// const jwt = require('jsonwebtoken');
// app.post('/api/login', (req, res) => {
//   const testUserId = 'test-user-12345';
//   const testUserSecret = process.env.JWT_SECRET || 'fallback-secret';
//   const token = jwt.sign(
//     { userId: testUserId, email: 'test@example.com', name: 'Test User' },
//     testUserSecret,
//     { expiresIn: '7d' }
//   );
//   res.json({ token, user: { id: testUserId, email: 'test@example.com', name: 'Test User' } });
// });
*/

app.get('/api/users/search', requireClerkAuth, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const documentId = typeof req.query.documentId === 'string' ? req.query.documentId : null;
  try {
    const rl = await userSearchLimiter.check(String(req.user.id));
    if (!rl.allowed) {
      return res.status(429).json({
        error: 'rate_limit',
        message: 'Too many searches. Try again shortly.',
        resetAt: rl.resetAt,
      });
    }
    const { source, users } = await searchShareDirectory({
      query: q,
      documentId,
      requesterUserId: req.user.id,
      requesterClerkUserId: req.user.clerkUserId ?? null,
    });
    res.json({ source, users });
  } catch (e) {
    console.error('[GET /api/users/search]', e?.message || e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/documents', requireClerkAuth, async (req, res) => {
  const docs = await listDocumentsForUser(req.user.id);
  res.json({ documents: docs });
});

app.get('/api/documents/:id', requireClerkAuth, async (req, res) => {
  const { id } = req.params;
  const linkToken = typeof req.query.linkToken === 'string' ? req.query.linkToken : null;
  try {
    const meta = await getDocumentMetaForAccess({
      userId: req.user.id,
      documentId: id,
      linkToken,
    });
    if (!meta) return res.status(404).json({ error: 'not_found' });
    res.json(meta);
  } catch (e) {
    console.error('[GET /api/documents/:id]', e?.message || e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.patch('/api/documents/:id', requireClerkAuth, async (req, res) => {
  const { id } = req.params;
  const { title, editorLanguage } = req.body || {};
  try {
    await updateDocumentMeta({
      userId: req.user.id,
      documentId: id,
      title,
      editorLanguage,
    });
    res.json({ ok: true });
  } catch (e) {
    if (e.statusCode === 403) {
      return res.status(403).json({ error: 'forbidden' });
    }
    console.error('[PATCH /api/documents/:id]', e?.message || e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/documents/:id/members', requireClerkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const data = await listDocumentMembersAndInvites({
      userId: req.user.id,
      documentId: id,
    });
    res.json(data);
  } catch (e) {
    if (e.statusCode === 403) return res.status(403).json({ error: 'forbidden' });
    if (e.statusCode === 404) return res.status(404).json({ error: 'not_found' });
    console.error('[GET /api/documents/:id/members]', e?.message || e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/documents/:id/members', requireClerkAuth, async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const { clerkUserId, userId } = body;
  const role = body.role === 'viewer' ? 'viewer' : 'editor';
  try {
    const rl = await inviteMemberLimiter.check(String(req.user.id));
    if (!rl.allowed) {
      return res.status(429).json({
        error: 'rate_limit',
        message: 'Too many invitations in a short time. Try again in a minute.',
        resetAt: rl.resetAt,
      });
    }

    let result;
    if (typeof clerkUserId === 'string' && clerkUserId.length > 0) {
      result = await addDocumentMemberByClerkId({
        ownerUserId: req.user.id,
        documentId: id,
        targetClerkUserId: clerkUserId,
        role,
      });
    } else if (typeof userId === 'string' && userId.length > 0) {
      result = await addDocumentMemberByUserId({
        ownerUserId: req.user.id,
        documentId: id,
        targetUserId: userId,
        role,
      });
    } else {
      return res.status(400).json({
        error: 'missing_target',
        message: 'Choose someone from search to add them to this document.',
      });
    }

    res.json(result);
  } catch (e) {
    if (e.statusCode === 403) return res.status(403).json({ error: 'forbidden' });
    if (e.statusCode === 404) return res.status(404).json({ error: 'not_found' });
    if (e.statusCode === 400) {
      return res.status(400).json({
        error: e.code || 'bad_request',
        message: e.message || 'Request failed',
      });
    }
    console.error('[POST /api/documents/:id/members]', e?.message || e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.patch('/api/documents/:id/members/:userId', requireClerkAuth, async (req, res) => {
  const { id, userId: targetUserId } = req.params;
  const { role } = req.body || {};
  try {
    await updateDocumentMemberRole({
      ownerUserId: req.user.id,
      documentId: id,
      targetUserId,
      role: role === 'viewer' ? 'viewer' : 'editor',
    });
    res.json({ ok: true });
  } catch (e) {
    if (e.statusCode === 403) return res.status(403).json({ error: 'forbidden' });
    if (e.statusCode === 404) return res.status(404).json({ error: 'not_found' });
    if (e.statusCode === 400) {
      return res.status(400).json({ error: e.message || 'bad_request' });
    }
    console.error('[PATCH /api/documents/:id/members/:userId]', e?.message || e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.delete('/api/documents/:id/members/:userId', requireClerkAuth, async (req, res) => {
  const { id, userId: targetUserId } = req.params;
  try {
    await removeDocumentMember({
      ownerUserId: req.user.id,
      documentId: id,
      targetUserId,
    });
    res.json({ ok: true });
  } catch (e) {
    if (e.statusCode === 403) return res.status(403).json({ error: 'forbidden' });
    if (e.statusCode === 404) return res.status(404).json({ error: 'not_found' });
    if (e.statusCode === 400) {
      return res.status(400).json({ error: e.message || 'bad_request' });
    }
    console.error('[DELETE /api/documents/:id/members/:userId]', e?.message || e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/documents/:id/access-requests', requireClerkAuth, async (req, res) => {
  const { id } = req.params;
  const requestedRole = req.body?.requestedRole === 'viewer' ? 'viewer' : 'editor';
  try {
    const rl = await inviteMemberLimiter.check(String(req.user.id));
    if (!rl.allowed) {
      return res.status(429).json({
        error: 'rate_limit',
        message: 'Too many requests in a short time. Try again in a minute.',
        resetAt: rl.resetAt,
      });
    }
    const result = await createAccessRequest({
      requesterUserId: req.user.id,
      documentId: id,
      requestedRole,
    });
    res.json(result);
  } catch (e) {
    if (e.statusCode === 404) return res.status(404).json({ error: 'not_found' });
    if (e.statusCode === 400) {
      return res.status(400).json({
        error: e.code || 'bad_request',
        message: e.message || 'Request failed',
      });
    }
    console.error('[POST /api/documents/:id/access-requests]', e?.message || e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/documents/:id/access-requests/:requestId/resolve', requireClerkAuth, async (req, res) => {
  const { id, requestId } = req.params;
  const raw = req.body?.decision;
  const decision = raw === 'approve' || raw === 'deny' ? raw : null;
  if (!decision) {
    return res.status(400).json({
      error: 'bad_request',
      message: 'decision must be approve or deny',
    });
  }
  try {
    const result = await resolveAccessRequest({
      ownerUserId: req.user.id,
      documentId: id,
      requestId,
      decision,
    });
    res.json(result);
  } catch (e) {
    if (e.statusCode === 403) return res.status(403).json({ error: 'forbidden' });
    if (e.statusCode === 404) return res.status(404).json({ error: 'not_found' });
    if (e.statusCode === 400) {
      return res.status(400).json({
        error: e.code || 'bad_request',
        message: e.message || 'Request failed',
      });
    }
    console.error('[POST /api/documents/:id/access-requests/:requestId/resolve]', e?.message || e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/notifications', requireClerkAuth, async (req, res) => {
  try {
    const rawLimit = req.query?.limit;
    const limit =
      typeof rawLimit === 'string' && rawLimit.length > 0 ? Number.parseInt(rawLimit, 10) : 50;
    const notifications = await listNotificationsForUser(req.user.id, { limit });
    const unreadCount = await countUnreadNotifications(req.user.id);
    res.json({ notifications, unreadCount });
  } catch (e) {
    console.error('[GET /api/notifications]', e?.message || e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.patch('/api/notifications/:id/read', requireClerkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const ok = await markNotificationRead({ userId: req.user.id, notificationId: id });
    if (!ok) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[PATCH /api/notifications/:id/read]', e?.message || e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/notifications/mark-all-read', requireClerkAuth, async (req, res) => {
  try {
    await markAllNotificationsRead(req.user.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[POST /api/notifications/mark-all-read]', e?.message || e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.delete('/api/notifications/:id', requireClerkAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const ok = await deleteNotificationForUser({ userId: req.user.id, notificationId: id });
    if (!ok) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/notifications/:id]', e?.message || e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.delete('/api/notifications', requireClerkAuth, async (req, res) => {
  try {
    await deleteAllNotificationsForUser(req.user.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/notifications]', e?.message || e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/documents', requireClerkAuth, async (req, res) => {
  // PREVIOUS IMPLEMENTATION (commented out):
  // - Created a document with only a title (blank Yjs state).
  //
  // Reason for change:
  // - When the user selects a template during creation, we encode that initial content into a Yjs update
  //   and persist it as the document's first update, so every client loads the same initial content.
  //
  // const { title } = req.body;
  // const doc = await createDocumentForUser({ userId: req.user.id, title: title || 'Untitled' });
  // res.json(doc);

  const { title, initialContent, editorLanguage } = req.body || {};

  let initialUpdateBytes = null;
  if (typeof initialContent === 'string' && initialContent.length > 0) {
    const initDoc = new Y.Doc();
    initDoc.getText('content').insert(0, initialContent);
    initialUpdateBytes = Y.encodeStateAsUpdate(initDoc);
  }

  const doc = await createDocumentForUser({
    userId: req.user.id,
    title: title || 'Untitled',
    initialUpdateBytes,
    editorLanguage,
  });
  res.json(doc);
});

// Code execution endpoint
app.post('/api/execute', requireClerkAuth, async (req, res) => {
  const { documentId, language, code } = req.body || {};

  // Validate input
  if (!language || !code) {
    return res.status(400).json({ error: 'Language and code are required' });
  }

  if (!['python', 'java'].includes(language)) {
    return res.status(400).json({ error: `Language ${language} is not supported for server-side execution` });
  }

  try {
    // Security: Validate code before execution
    validateCode(code, language);

    // Queue execution with user ID for rate limiting
    // Note: Don't pass executor function - worker will look it up by language
    const result = await executionQueue.enqueue({
      code,
      language,
      options: {
        timeout: 10000, // 10 seconds
      },
    }, req.user.id);

    // Emit result via WebSocket to all clients viewing this document
    // CRITICAL: Wrap in try-catch to prevent WebSocket errors from breaking the connection
    if (documentId) {
      try {
        io.to(documentId).emit('code-execution-result', {
          documentId,
          userId: req.user.id,
          language,
          ...result,
        });
      } catch (wsError) {
        console.error('[API] Failed to emit WebSocket result (non-fatal):', wsError.message);
        // Don't throw - HTTP response still needs to be sent
      }
    }

    res.json({
      executionId: result.executionId,
      status: result.status,
      output: result.output,
      error: result.error,
      executionTimeMs: result.executionTimeMs,
    });
  } catch (error) {
    // CRITICAL: Catch ALL errors to prevent server crash
    // Log error but don't let it propagate and crash the server
    console.error('[API] Execution error:', error);
    console.error('[API] Error stack:', error.stack);

    // Emit error via WebSocket if documentId exists (don't let WS errors crash server)
    if (documentId) {
      try {
        io.to(documentId).emit('code-execution-result', {
          documentId,
          userId: req.user.id,
          language,
          status: 'failed',
          error: error.message || 'Execution failed',
          executionId: null,
        });
      } catch (wsError) {
        console.error('[API] Failed to emit WebSocket error (non-fatal):', wsError.message);
        // Don't throw - we still need to send HTTP response
      }
    }

    // Always send a valid JSON response - never let the request hang
    const statusCode = error.message?.includes('Rate limit') ? 429 : 400;

    // Ensure response hasn't been sent already
    if (!res.headersSent) {
      res.status(statusCode).json({
        error: error.message || 'Execution failed',
        executionId: null,
        status: 'failed',
      });
    }
  }
});

// Phase 7: Document Chat — paginated history.
// Auth: any role (owner/editor/viewer) can read messages, OR an authenticated
// user holding a valid share-link token. Mirrors the socket `join-document`
// authorization so REST and websocket paths stay in sync.
app.get('/api/documents/:id/messages', requireClerkAuth, async (req, res) => {
  const { id: documentId } = req.params;
  const { before, limit, linkToken } = req.query;

  try {
    let role = await getMemberRole({ userId: req.user.id, documentId });
    if (!role && typeof linkToken === 'string' && linkToken.length > 0) {
      role = await validateLinkToken({ documentId, token: linkToken });
    }
    if (!role) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const parsedLimit = limit ? Number(limit) : undefined;
    const messages = await listMessages({
      documentId,
      before: typeof before === 'string' && before.length > 0 ? before : undefined,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
    res.json({ messages });
  } catch (e) {
    console.error('list messages failed:', e?.message || e);
    res.status(500).json({ error: 'list_messages_failed' });
  }
});

app.post('/api/documents/:id/share-link', requireClerkAuth, async (req, res) => {
  const { id } = req.params;
  const mode = req.body?.mode === 'edit' ? 'edit' : 'view';
  try {
    const { token, shareStatus } = await rotateShareLink({
      userId: req.user.id,
      documentId: id,
      mode,
    });
    res.json({ token, shareStatus });
  } catch (e) {
    const status = e.statusCode || 500;
    res.status(status).json({ error: e.message || 'error' });
  }
});

app.get('/api/folders', requireClerkAuth, async (req, res) => {
  const folders = await listFoldersForUser(req.user.id);
  res.json({ folders });
});

app.post('/api/folders', requireClerkAuth, async (req, res) => {
  const { name, parentFolderId } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name_required' });
  const folder = await createFolderForUser({ userId: req.user.id, name, parentFolderId });
  res.json(folder);
});

// Health check endpoint for monitoring
app.get('/health', (req, res) => {
  const stats = global.updateStats || { totalUpdates: 0, totalLatency: 0, errors: 0 };
  const avgLatency = stats.totalUpdates > 0 ? Math.round(stats.totalLatency / stats.totalUpdates) : 0;

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    // Previously this reported the in-memory Map size.
    // Reason for change: documents are now stored in Postgres, and we don't keep a global in-memory Map.
    // documents: documents.size,
    documents: null,
    activeConnections: io.engine.clientsCount,
    performance: {
      totalUpdates: stats.totalUpdates,
      averageLatency: avgLatency,
      errorRate: stats.totalUpdates > 0 ? (stats.errors / stats.totalUpdates * 100).toFixed(2) : 0
    }
  });
});

const PORT = process.env.PORT || 5000;

// CRITICAL: Prevent unhandled errors from crashing the server
// This ensures WebSocket connections and other requests stay alive
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - log and continue
});

process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught Exception:', error);
  // Don't exit - log and continue
  // In production, you might want to exit here, but for development, continue
});

(async () => {
  // PREVIOUS IMPLEMENTATION (commented out):
  // - Always ran migrations on startup.
  //
  // Reason for change:
  // - Until you provision Neon and set DATABASE_URL, running migrations will fail. We only run them when DATABASE_URL is configured.
  //
  // try {
  //   await migrate();
  // } catch (e) {
  //   console.error('❌ Database migration failed:', e);
  //   process.exitCode = 1;
  //   return;
  // }

  if (process.env.DATABASE_URL) {
    try {
      await migrate();
    } catch (e) {
      console.error('❌ Database migration failed:', e);
      process.exitCode = 1;
      return;
    }
  } else {
    console.warn(
      '⚠️ DATABASE_URL is not set. Skipping migrations. ' +
      'Set up Neon + DATABASE_URL, then run: `pnpm -C server run migrate`'
    );
  }

  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔌 WebSocket server ready for collaborative editing`);
    console.log(`📊 Health check available at /health`);
  });
})();

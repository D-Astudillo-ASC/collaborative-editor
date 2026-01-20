import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import * as Y from 'yjs';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

import { migrate } from './db/migrate.js';
import { requireClerkAuth, socketClerkAuth } from './auth/middleware.js';
import { listDocumentsForUser, createDocumentForUser, validateLinkToken, rotateShareLink, getMemberRole } from './db/documents.js';
import { listFoldersForUser, createFolderForUser } from './db/folders.js';
import { getDocumentState, fetchUpdatesAfter, appendUpdate, markSnapshot } from './db/updates.js';
import { downloadSnapshotBytes, uploadSnapshot } from './r2/snapshots.js';
import { validateCode } from './execution/executor.js';
import { executionQueue } from './execution/queue.js';

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
      socket.emit('error', { message: 'missing_documentId' });
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
      });

      const room = io.sockets.adapter.rooms.get(documentId);
      const activeUsers = Array.from(room || []).map((socketId) => ({
        userId: socketId,
        userName: `User ${socketId.slice(0, 6)}`,
      }));

      socket.to(documentId).emit('user-joined', {
        userId: socket.id,
        userName: `User ${socket.id.slice(0, 6)}`,
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

  socket.on('send-message', wrapHandler((data) => {
    const { documentId, message, userId } = data;
    console.log(`Client ${socket.id} sending message:`, message);

    // Broadcast message to other clients in the same document
    try {
      socket.to(documentId).emit('message-received', {
        documentId,
        message,
        userId: userId || socket.id,
        userName: `User ${(userId || socket.id).slice(0, 6)}`,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[WebSocket] Error emitting message-received:', error.message);
    }
  }));

  // Handle typing indicators
  socket.on('typing-start', wrapHandler((data) => {
    const { documentId, userName } = data;
    console.log(`Client ${socket.id} started typing in ${documentId}`);

    // Broadcast typing start to other clients
    try {
      socket.to(documentId).emit('typing-start', {
        documentId,
        userName,
        userId: socket.id
      });
    } catch (error) {
      console.error('[WebSocket] Error emitting typing-start:', error.message);
    }
  }));

  socket.on('typing-stop', wrapHandler((data) => {
    const { documentId, userName } = data;
    console.log(`Client ${socket.id} stopped typing in ${documentId}`);

    // Broadcast typing stop to other clients
    try {
      socket.to(documentId).emit('typing-stop', {
        documentId,
        userName,
        userId: socket.id
      });
    } catch (error) {
      console.error('[WebSocket] Error emitting typing-stop:', error.message);
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
      socket.to(documentId).emit('user-left', {
        userId: socket.id,
        userName: `User ${socket.id.slice(0, 6)}`,
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
        const activeUsers = Array.from(room).map(socketId => ({
          userId: socketId,
          userName: `User ${socketId.slice(0, 6)}`
        }));
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

app.get('/api/documents', requireClerkAuth, async (req, res) => {
  const docs = await listDocumentsForUser(req.user.id);
  res.json({ documents: docs });
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

  const { title, initialContent } = req.body || {};

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

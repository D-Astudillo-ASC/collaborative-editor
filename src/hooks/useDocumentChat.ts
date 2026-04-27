/**
 * Phase 7: Document Chat hook.
 *
 * Owns the chat state machine for a single document:
 *   - Initial paginated history fetch via REST.
 *   - Live updates via Socket.IO (`chat:message`, `chat:typing`, `chat:error`).
 *   - Optimistic send: an outgoing message renders instantly with status='sending'
 *     and is reconciled by clientId when the server echoes back. On error it
 *     flips to status='failed' so the UI can offer a retry.
 *   - Typing indicator (debounced, auto-stops after idle).
 *   - Unread tracking (caller decides when the panel is "visible").
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';
import { getSocket } from '@/services/socket';
import { apiUrl } from '@/config/backend';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChatMessageStatus = 'sending' | 'sent' | 'failed';

/** Color palette mirrored from src/hooks/use-auth.ts so colors are stable
 *  for any user we render (current or remote) regardless of where the
 *  message originates. */
const USER_COLORS = [
  '#6366f1', // indigo
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#14b8a6', // teal
];

export function colorForUser(clerkUserId: string | undefined | null): string {
  if (!clerkUserId) return USER_COLORS[0];
  const idx = clerkUserId
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % USER_COLORS.length;
  return USER_COLORS[idx];
}

/**
 * Resolved mention payload — only ever produced by the server. The client
 * sends `mentions: clerkId[]` on chat:send; the server validates against the
 * users table and stores `[{ clerkId, name }]` here so the rendered highlight
 * is honest (a malicious client cannot make arbitrary `@text` light up).
 */
export interface ResolvedMention {
  clerkId: string;
  name: string | null;
}

/**
 * Snapshot of a parent message embedded in replies. The server returns a
 * fresh snapshot at read time so quotes update if the parent is edited or
 * deleted before the reply is loaded.
 */
export interface ParentSnapshot {
  id: string;
  authorClerkId: string | null;
  authorName: string | null;
  /** Server-resolved avatar at read time. Null for system / unknown senders. */
  authorAvatarUrl: string | null;
  /** ISO timestamp of the parent's `created_at`. Used by the hover preview to
   *  render a "2 minutes ago"-style affordance. */
  createdAt: string;
  contentExcerpt: string;
  deletedAt: string | null;
}

export interface ChatMessageMetadata {
  mentions?: ResolvedMention[];
  // Other server-derived enrichments live here.
  [key: string]: unknown;
}

export interface ChatMessage {
  /** Server-assigned uuid (present once persisted). */
  id: string;
  documentId: string;
  /** Internal users.id (uuid). */
  userId: string;
  /** Client-supplied id used to dedupe optimistic inserts. Always present. */
  clientId: string | null;
  content: string;
  metadata: ChatMessageMetadata;
  createdAt: string; // ISO timestamp
  /** Set if/when the sender edited within the 15-min window. */
  editedAt: string | null;
  /** Set if/when the sender soft-deleted within the 15-min window. */
  deletedAt: string | null;
  /** Reply: id of the parent message, if any. */
  parentId: string | null;
  /** Server-provided snapshot of the parent (for rendering reply quotes). */
  parent: ParentSnapshot | null;
  // Sender profile (joined server-side):
  senderClerkId: string | null;
  senderName: string | null;
  senderEmail: string | null;
  senderAvatarUrl: string | null;
  // Client-only state:
  status: ChatMessageStatus;
}

export interface TypingUser {
  userId: string; // internal users.id (matches message.userId)
  /** Stable Clerk id — used for self-filter and to attribute typing reliably
   *  even when the user has no display name yet. */
  userClerkId: string | null;
  /** Display name. May be null when the user hasn't synced their profile yet. */
  userName: string | null;
  userAvatarUrl: string | null;
  /** Last time we saw a typing=true ping from this user. */
  lastSeen: number;
}

interface UseDocumentChatOptions {
  documentId: string | null | undefined;
  /**
   * Whether the chat surface is currently visible to the user. When false,
   * incoming messages from other users increment `unreadCount`.
   */
  isVisible: boolean;
  /**
   * Optional share-link token — forwarded on history fetches so users who
   * only have access via a share link (i.e. not document_members) can still
   * read history. Mirrors the socket `join-document` flow.
   */
  linkToken?: string | null;
}

/**
 * Phase 2 send/edit options — both fields are server-validated:
 *   - `parentId` must reference a message in the same document.
 *   - `mentions` is an array of clerk-ids resolved against the users table.
 */
export interface SendMessageOptions {
  parentId?: string | null;
  mentions?: string[];
  /**
   * Optional display names for optimistic @ highlights before the server
   * echoes canonical `metadata.mentions`. Built client-side from the same
   * candidate list used to extract `mentions`.
   */
  mentionHints?: ResolvedMention[];
}

interface UseDocumentChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  sendMessage: (content: string, options?: SendMessageOptions) => void;
  retryMessage: (clientId: string, options?: { mentions?: string[] }) => void;
  /** Edit an own message that's still inside the 15-min window. */
  editMessage: (messageId: string, content: string) => void;
  /** Soft-delete an own message that's still inside the 15-min window. */
  deleteMessage: (messageId: string) => void;
  setTyping: (isTyping: boolean) => void;
  typingUsers: TypingUser[];
  unreadCount: number;
  resetUnread: () => void;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;
const TYPING_AUTO_STOP_MS = 3_000;
const TYPING_STALE_MS = 4_000;
const MAX_CONTENT_CHARS = 1_000;
/**
 * Max optimistic messages allowed in `status: 'sending'` at once. Once this
 * many are in-flight, further sends are rejected with a friendly error
 * instead of stacking and saturating the socket. The server applies a hard
 * per-user rate limit on top of this; this is just client-side flow control
 * so the UI stays honest.
 */
const MAX_INFLIGHT_SENDS = 5;
/**
 * If the server doesn't echo a `chat:message` (or `chat:error`) within this
 * window, we flip the optimistic row to `failed` so the user can retry. This
 * is a defense against ack loss (server crash mid-emit, socket dropped during
 * reconnect, etc.) — the spinner must never spin forever.
 */
const SEND_TIMEOUT_MS = 15_000;
const SEND_SWEEP_INTERVAL_MS = 1_500;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDocumentChat({
  documentId,
  isVisible,
  linkToken,
}: UseDocumentChatOptions): UseDocumentChatReturn {
  const { token, user, getAccessToken } = useAuth();
  // useMemo so the socket reference is stable across renders for the lifetime
  // of the auth token (mirrors useCollaboration's pattern).
  const socket: Socket | null = useMemo(
    () => (token ? getSocket(token) : null),
    [token]
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refs to avoid stale closures inside socket handlers.
  const isVisibleRef = useRef(isVisible);
  useEffect(() => {
    isVisibleRef.current = isVisible;
  }, [isVisible]);

  const documentIdRef = useRef(documentId);
  useEffect(() => {
    documentIdRef.current = documentId;
  }, [documentId]);

  const ownClerkIdRef = useRef<string | null>(user?.id || null);
  useEffect(() => {
    ownClerkIdRef.current = user?.id || null;
  }, [user]);

  // Currently-typing local user state (debounce timers).
  const typingStateRef = useRef({ isTyping: false, stopTimer: 0 as number | 0 });

  // Tracks epoch-ms of when each in-flight optimistic send started, keyed by
  // clientId. The sweeper reads this to fail messages that never get an ack;
  // success/error paths delete the entry. Lives in a ref because callbacks
  // and the interval need stable access without re-subscribing.
  const sendStartedAtRef = useRef<Map<string, number>>(new Map());

  // -------------------------------------------------------------------------
  // Initial history fetch — runs whenever documentId or auth changes.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!documentId) {
      setMessages([]);
      setHasMore(false);
      return;
    }
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const t = await getAccessToken();
        if (!t) return;
        const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
        if (linkToken) params.set('linkToken', linkToken);
        const res = await fetch(
          apiUrl(`/api/documents/${documentId}/messages?${params.toString()}`),
          { headers: { Authorization: `Bearer ${t}` } }
        );
        if (!res.ok) throw new Error(`history fetch failed: ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        // Server returns newest-first; UI renders oldest at top, so reverse.
        const list = (data.messages || []).map((m: ChatMessage) => ({
          ...m,
          status: 'sent' as ChatMessageStatus,
        }));
        list.reverse();
        setMessages(list);
        setHasMore(list.length >= PAGE_SIZE);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message || 'Failed to load messages');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [documentId, getAccessToken, linkToken]);

  // -------------------------------------------------------------------------
  // Socket subscription — runs whenever socket or documentId changes.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!socket || !documentId) return;

    const onMessage = (msg: ChatMessage) => {
      if (msg.documentId !== documentIdRef.current) return;

      // The send is acknowledged — stop tracking the deadline before we
      // touch state, so a sweep that races us doesn't fail this row.
      if (msg.clientId) sendStartedAtRef.current.delete(msg.clientId);

      setMessages((prev) => {
        // 1. If we already have this exact server id, ignore.
        if (msg.id && prev.some((p) => p.id === msg.id)) return prev;
        // 2. Reconcile optimistic insert by clientId — replace it in place
        //    so the UI doesn't flicker.
        if (msg.clientId) {
          const idx = prev.findIndex((p) => p.clientId === msg.clientId);
          if (idx >= 0) {
            const next = prev.slice();
            next[idx] = { ...msg, status: 'sent' };
            return next;
          }
        }
        return [...prev, { ...msg, status: 'sent' }];
      });

      // Bump unread for messages from other users while panel is hidden.
      const isOwn = msg.senderClerkId === ownClerkIdRef.current;
      if (!isOwn && !isVisibleRef.current) {
        setUnreadCount((c) => c + 1);
      }
      // Whoever just sent this message has stopped typing.
      setTypingUsers((prev) => prev.filter((u) => u.userId !== msg.userId));
    };

    const onTyping = (data: {
      documentId: string;
      userId: string;
      userClerkId?: string | null;
      userName?: string | null;
      userAvatarUrl?: string | null;
      isTyping: boolean;
    }) => {
      if (data.documentId !== documentIdRef.current) return;

      // Defense-in-depth: server already excludes the sender via socket.to(),
      // but if the same Clerk user has multiple tabs open, we don't want
      // typing from our other tab to render here.
      if (data.userClerkId && data.userClerkId === ownClerkIdRef.current) return;

      setTypingUsers((prev) => {
        const without = prev.filter((u) => u.userId !== data.userId);
        if (data.isTyping) {
          return [
            ...without,
            {
              userId: data.userId,
              userClerkId: data.userClerkId || null,
              userName: data.userName || null,
              userAvatarUrl: data.userAvatarUrl || null,
              lastSeen: Date.now(),
            },
          ];
        }
        return without;
      });
    };

    const onError = (data: { clientId?: string; message?: string }) => {
      if (data.clientId) {
        // Server has spoken — stop tracking the deadline so we don't
        // double-fail (or, worse, race the sweeper after a retry).
        sendStartedAtRef.current.delete(data.clientId);
        setMessages((prev) =>
          prev.map((m) =>
            m.clientId === data.clientId ? { ...m, status: 'failed' } : m
          )
        );
      }
      if (data.message) {
        setError(humanizeServerError(data.message));
      }
    };

    // Phase 2: edits and soft-deletes are broadcast to every client in the
    // room, including the sender, so we reconcile optimistic mutations the
    // same way we do for sends — by id.
    const onUpdated = (msg: ChatMessage) => {
      if (msg.documentId !== documentIdRef.current) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...msg, status: 'sent' as ChatMessageStatus } : m
        )
      );
      // If this updated message was the parent of any reply we have loaded,
      // we *do not* mutate those replies' embedded `parent` snapshots — those
      // were resolved server-side at the original load and a stale-but-honest
      // snapshot is fine. The next history fetch will refresh them.
    };

    const onDeleted = (data: {
      messageId: string;
      documentId: string;
      deletedAt: string;
    }) => {
      if (data.documentId !== documentIdRef.current) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId
            ? { ...m, content: '', deletedAt: data.deletedAt }
            : m
        )
      );
    };

    socket.on('chat:message', onMessage);
    socket.on('chat:typing', onTyping);
    socket.on('chat:error', onError);
    socket.on('chat:message:updated', onUpdated);
    socket.on('chat:message:deleted', onDeleted);

    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:typing', onTyping);
      socket.off('chat:error', onError);
      socket.off('chat:message:updated', onUpdated);
      socket.off('chat:message:deleted', onDeleted);
    };
  }, [socket, documentId]);

  // -------------------------------------------------------------------------
  // Reap stale typing users — keeps the indicator from getting stuck if a
  // client disappears without sending a final isTyping=false.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const interval = window.setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now();
        const fresh = prev.filter((u) => now - u.lastSeen < TYPING_STALE_MS);
        return fresh.length === prev.length ? prev : fresh;
      });
    }, 1_000);
    return () => window.clearInterval(interval);
  }, []);

  // -------------------------------------------------------------------------
  // Reap stuck optimistic sends — if the server hasn't echoed after
  // SEND_TIMEOUT_MS we flip the row to 'failed' so the user can retry.
  // The deadline anchor is the ref-tracked start time when present (set on
  // sendMessage / retryMessage); if missing (e.g. the row predates this
  // mount because the user navigated away and back), we fall back to
  // createdAt so orphaned spinners still resolve.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      setMessages((prev) => {
        let mutated = false;
        const next = prev.map((m) => {
          if (m.status !== 'sending') return m;
          const tracked = m.clientId
            ? sendStartedAtRef.current.get(m.clientId)
            : undefined;
          const anchor = tracked ?? new Date(m.createdAt).getTime();
          if (now - anchor <= SEND_TIMEOUT_MS) return m;
          mutated = true;
          if (m.clientId) sendStartedAtRef.current.delete(m.clientId);
          return { ...m, status: 'failed' as ChatMessageStatus };
        });
        return mutated ? next : prev;
      });
    }, SEND_SWEEP_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  // -------------------------------------------------------------------------
  // Reset unread when visibility flips to true.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isVisible) setUnreadCount(0);
  }, [isVisible]);

  // -------------------------------------------------------------------------
  // Pagination — fetch older messages.
  // -------------------------------------------------------------------------
  const loadMore = useCallback(async () => {
    if (!documentId || isLoading || !hasMore) return;
    const oldest = messages[0];
    if (!oldest?.id) return;
    setIsLoading(true);
    try {
      const t = await getAccessToken();
      if (!t) return;
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        before: oldest.id,
      });
      if (linkToken) params.set('linkToken', linkToken);
      const res = await fetch(
        apiUrl(`/api/documents/${documentId}/messages?${params.toString()}`),
        { headers: { Authorization: `Bearer ${t}` } }
      );
      if (!res.ok) throw new Error(`history fetch failed: ${res.status}`);
      const data = await res.json();
      const older = (data.messages || []).map((m: ChatMessage) => ({
        ...m,
        status: 'sent' as ChatMessageStatus,
      }));
      older.reverse();
      setMessages((prev) => [...older, ...prev]);
      setHasMore(older.length >= PAGE_SIZE);
    } catch (e) {
      setError((e as Error).message || 'Failed to load older messages');
    } finally {
      setIsLoading(false);
    }
  }, [documentId, isLoading, hasMore, messages, getAccessToken, linkToken]);

  // -------------------------------------------------------------------------
  // Send (optimistic).
  // -------------------------------------------------------------------------
  const sendMessage = useCallback(
    (content: string, options?: SendMessageOptions) => {
      const trimmed = content.trim();
      if (!trimmed || !socket || !documentId || !user) return;
      if (trimmed.length > MAX_CONTENT_CHARS) {
        setError(`Message too long (max ${MAX_CONTENT_CHARS} characters).`);
        return;
      }

      // Client-side flow control: cap in-flight optimistic sends. Without
      // this, mashing Enter while the connection is slow accumulates pending
      // messages indefinitely.
      const inflight = messages.filter((m) => m.status === 'sending').length;
      if (inflight >= MAX_INFLIGHT_SENDS) {
        setError('You have several messages in flight — give them a moment to deliver.');
        return;
      }

      const clientId = `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const parentId = options?.parentId ?? null;
      const mentionIds = Array.isArray(options?.mentions) ? options!.mentions : [];
      const hintById = new Map<string, string | null>();
      for (const h of options?.mentionHints ?? []) {
        if (typeof h?.clerkId === 'string' && h.clerkId.length > 0) {
          hintById.set(h.clerkId, h.name ?? null);
        }
      }

      // For the optimistic render we use a *minimal* parent snapshot — the
      // server returns the canonical one with the echo. We try to look up
      // the parent in our currently-loaded list; if we can't find it, we
      // skip the snapshot and the server reconciliation will fill it in.
      const parentForOptimistic: ParentSnapshot | null = (() => {
        if (!parentId) return null;
        const found = messages.find((m) => m.id === parentId);
        if (!found) return null;
        return {
          id: found.id,
          authorClerkId: found.senderClerkId,
          authorName: found.senderName,
          authorAvatarUrl: found.senderAvatarUrl,
          createdAt: found.createdAt,
          contentExcerpt: found.deletedAt ? '' : found.content.slice(0, 140),
          deletedAt: found.deletedAt,
        };
      })();

      // Optimistic mention payload — names come from optional hints so @ spans
      // light up immediately; the server echo replaces with authoritative
      // metadata.
      const optimisticMentions: ResolvedMention[] = mentionIds.map((clerkId) => ({
        clerkId,
        name: hintById.get(clerkId) ?? null,
      }));

      const optimistic: ChatMessage = {
        id: `opt-${clientId}`,
        documentId,
        userId: '', // unknown until server persists; not used for rendering
        clientId,
        content: trimmed,
        metadata: { mentions: optimisticMentions },
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        parentId,
        parent: parentForOptimistic,
        senderClerkId: user.id,
        senderName: user.name,
        senderEmail: user.email,
        senderAvatarUrl: user.imageUrl ?? null,
        status: 'sending',
      };
      setMessages((prev) => [...prev, optimistic]);
      // Arm the timeout deadline before emitting; if the server is dead the
      // sweeper will flip this row to 'failed' after SEND_TIMEOUT_MS.
      sendStartedAtRef.current.set(clientId, Date.now());
      socket.emit('chat:send', {
        documentId,
        clientId,
        content: trimmed,
        parentId,
        mentions: mentionIds,
      });
    },
    [socket, documentId, user, messages]
  );

  // -------------------------------------------------------------------------
  // Edit (optimistic). The 15-minute window + ownership are enforced
  // server-side; if the gate rejects we restore the original content from
  // a snapshot taken before the optimistic mutation.
  // -------------------------------------------------------------------------
  const editMessage = useCallback(
    (messageId: string, content: string) => {
      if (!socket || !documentId) return;
      const trimmed = content.trim();
      if (!trimmed) return;
      if (trimmed.length > MAX_CONTENT_CHARS) {
        setError(`Message too long (max ${MAX_CONTENT_CHARS} characters).`);
        return;
      }

      const original = messages.find((m) => m.id === messageId);
      if (!original) return;
      if (original.content === trimmed) return; // no-op

      // Optimistic: apply locally and stash the previous content so we can
      // roll back if the server rejects.
      const previousContent = original.content;
      const previousEditedAt = original.editedAt;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, content: trimmed, editedAt: new Date().toISOString() }
            : m
        )
      );

      // We listen for the next chat:error tagged with this messageId, and on
      // receipt we restore `previousContent`. The handler is one-shot; on
      // success the server's chat:message:updated reconciles the row anyway.
      const restoreOnError = (data: { messageId?: string; message?: string }) => {
        if (data.messageId !== messageId) return;
        socket.off('chat:error', restoreOnError);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, content: previousContent, editedAt: previousEditedAt }
              : m
          )
        );
        setError(humanizeServerError(data.message || 'edit_forbidden'));
      };
      socket.on('chat:error', restoreOnError);
      // Auto-clean the listener after a generous timeout in case the server
      // never replies (e.g. the socket disconnected mid-flight).
      window.setTimeout(() => socket.off('chat:error', restoreOnError), 10_000);

      socket.emit('chat:edit', {
        documentId,
        messageId,
        content: trimmed,
      });
    },
    [socket, documentId, messages]
  );

  // -------------------------------------------------------------------------
  // Delete (optimistic tombstone with rollback on error).
  // -------------------------------------------------------------------------
  const deleteMessage = useCallback(
    (messageId: string) => {
      if (!socket || !documentId) return;
      const original = messages.find((m) => m.id === messageId);
      if (!original) return;
      if (original.deletedAt) return; // already deleted

      // Stash for rollback and apply tombstone optimistically.
      const previousContent = original.content;
      const previousDeletedAt = original.deletedAt;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, content: '', deletedAt: new Date().toISOString() }
            : m
        )
      );

      const restoreOnError = (data: { messageId?: string; message?: string }) => {
        if (data.messageId !== messageId) return;
        socket.off('chat:error', restoreOnError);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, content: previousContent, deletedAt: previousDeletedAt }
              : m
          )
        );
        setError(humanizeServerError(data.message || 'delete_forbidden'));
      };
      socket.on('chat:error', restoreOnError);
      window.setTimeout(() => socket.off('chat:error', restoreOnError), 10_000);

      socket.emit('chat:delete', { documentId, messageId });
    },
    [socket, documentId, messages]
  );

  // -------------------------------------------------------------------------
  // Retry a failed send (re-emit with same clientId; server is idempotent).
  // -------------------------------------------------------------------------
  const retryMessage = useCallback(
    (clientId: string, options?: { mentions?: string[] }) => {
      if (!socket || !documentId) return;
      const target = messages.find((m) => m.clientId === clientId);
      if (!target) return;
      setMessages((prev) =>
        prev.map((m) => (m.clientId === clientId ? { ...m, status: 'sending' } : m))
      );
      // Re-arm the deadline so this retry gets its own SEND_TIMEOUT_MS.
      sendStartedAtRef.current.set(clientId, Date.now());
      const mentionIds = Array.isArray(options?.mentions) ? options!.mentions! : [];
      socket.emit('chat:send', {
        documentId,
        clientId,
        content: target.content,
        parentId: target.parentId ?? undefined,
        mentions: mentionIds,
      });
    },
    [socket, documentId, messages]
  );

  // -------------------------------------------------------------------------
  // Typing — debounced auto-stop.
  // -------------------------------------------------------------------------
  const setTyping = useCallback(
    (isTyping: boolean) => {
      if (!socket || !documentId) return;
      const state = typingStateRef.current;

      if (isTyping) {
        if (!state.isTyping) {
          state.isTyping = true;
          socket.emit('chat:typing', { documentId, isTyping: true });
        }
        if (state.stopTimer) window.clearTimeout(state.stopTimer);
        state.stopTimer = window.setTimeout(() => {
          state.isTyping = false;
          socket.emit('chat:typing', { documentId, isTyping: false });
        }, TYPING_AUTO_STOP_MS);
      } else {
        if (state.stopTimer) window.clearTimeout(state.stopTimer);
        if (state.isTyping) {
          state.isTyping = false;
          socket.emit('chat:typing', { documentId, isTyping: false });
        }
      }
    },
    [socket, documentId]
  );

  // Stop emitting typing on unmount/document switch. We capture the ref value
  // synchronously at effect-setup time so cleanup doesn't read a potentially
  // mutated ref (the ref object identity is stable, but eslint doesn't know).
  useEffect(() => {
    const state = typingStateRef.current;
    return () => {
      if (state.stopTimer) window.clearTimeout(state.stopTimer);
      if (state.isTyping && socket && documentId) {
        socket.emit('chat:typing', { documentId, isTyping: false });
        state.isTyping = false;
      }
    };
  }, [socket, documentId]);

  const resetUnread = useCallback(() => setUnreadCount(0), []);

  return {
    messages,
    isLoading,
    hasMore,
    loadMore,
    sendMessage,
    retryMessage,
    editMessage,
    deleteMessage,
    setTyping,
    typingUsers,
    unreadCount,
    resetUnread,
    error,
  };
}

function humanizeServerError(code: string): string {
  switch (code) {
    case 'rate_limited':
      return 'Slow down — you are sending messages too quickly.';
    case 'content_too_long':
      return 'Message is too long.';
    case 'empty_content':
      return "You can't send an empty message.";
    case 'not_in_document':
      return 'You are not connected to this document.';
    case 'unauthenticated':
      return 'Please sign in to chat.';
    case 'persist_failed':
      return 'We could not deliver your message. Please retry.';
    case 'edit_forbidden':
      return 'This message can no longer be edited.';
    case 'delete_forbidden':
      return 'This message can no longer be deleted.';
    default:
      return 'Something went wrong.';
  }
}

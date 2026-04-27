/**
 * Phase 7: Document Chat Panel
 *
 * Realtime chat for the active document. Persisted in Postgres, delivered via
 * Socket.IO. Designed to mirror the quality bar of AIAssistantPanel:
 *   - Glassmorphic header with online count.
 *   - Color-coded bubbles using each user's deterministic accent color.
 *   - Message grouping (consecutive messages from the same author within
 *     a small time window collapse the avatar/name).
 *   - Animated typing indicator.
 *   - Optimistic send with status reconciliation (sending / sent / failed + retry).
 *   - Auto-scroll only when the user is already at the bottom; otherwise show
 *     a "jump to latest" pill.
 */

import {
  ChangeEvent,
  forwardRef,
  KeyboardEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowDown,
  CornerUpLeft,
  Loader2,
  MessageSquare,
  Pencil,
  RotateCcw,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import {
  buildMentionCandidates,
  displayNameToMentionToken,
  extractMentionClerkIdsFromContent,
  filterMentionCandidates,
  getActiveMentionAtCaret,
  mergeAuthorsFromMessages,
  type MentionCandidate,
} from '@/lib/chat-mentions';
import { cn } from '@/lib/utils';
import {
  colorForUser,
  type ChatMessage,
  type TypingUser,
  type ResolvedMention,
} from '@/hooks/useDocumentChat';
import { MessageContent } from './MessageContent';
import type { User, UserPresence } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The panel is a pure view; chat state lives in `useDocumentChat` and is
 * lifted to the editor page so the unread badge on the (collapsed) Chat tab
 * can read the same instance instead of opening a duplicate subscription.
 */
interface ChatPanelProps {
  documentId: string;
  /** The current authenticated user. May be null while auth is loading. */
  currentUser: User | null;
  /** Active collaborators in the room — drives the "online" count. */
  collaborators: UserPresence[];
  // ----- chat state passed down from the parent's useDocumentChat -----
  messages: ChatMessage[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  sendMessage: (
    content: string,
    options?: {
      parentId?: string | null;
      mentions?: string[];
      mentionHints?: ResolvedMention[];
    },
  ) => void;
  retryMessage: (clientId: string, options?: { mentions?: string[] }) => void;
  /** Phase 2: edit own message inside the 15-min window. */
  editMessage: (messageId: string, content: string) => void;
  /** Phase 2: soft-delete own message inside the 15-min window. */
  deleteMessage: (messageId: string) => void;
  setTyping: (isTyping: boolean) => void;
  typingUsers: TypingUser[];
  error: string | null;
}

// ---------------------------------------------------------------------------
// Phase 2 — edit/delete window
// ---------------------------------------------------------------------------

/** Mirrors the SQL gate in server/db/chat.js. Source of truth is the server. */
const EDIT_WINDOW_MS = 15 * 60 * 1000;

/** Cap @mention autocomplete so the popover stays scannable. */
const MENTION_MENU_MAX = 8;

function isWithinEditWindow(message: ChatMessage): boolean {
  if (message.deletedAt) return false;
  const created = new Date(message.createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  return Date.now() - created < EDIT_WINDOW_MS;
}

/**
 * Imperative handle exposed to the editor page so it can focus the input
 * when the user activates the chat tab.
 */
export interface ChatPanelHandle {
  focusInput: () => void;
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

const GROUP_WINDOW_MS = 2 * 60 * 1000;

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Display-name fallback ladder. Avoids the "Anonymous" black hole when a
 * user hasn't synced their Clerk profile to the server yet — falls back to
 * the email local-part, then a generic "User" label.
 */
function displayNameFor(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed) return trimmed;
  if (typeof email === 'string' && email.includes('@')) {
    const local = email.split('@')[0]?.trim();
    if (local) return local;
  }
  return 'User';
}

// Group sequential messages from the same author into rows so we only render
// the avatar + name on the first message of each run.
interface DisplayGroup {
  authorClerkId: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  authorColor: string;
  isOwn: boolean;
  messages: ChatMessage[];
  /** Day label to render before this group; null when continuing the same day. */
  dayLabel: string | null;
}

function groupMessages(
  messages: ChatMessage[],
  ownClerkId: string | null,
): DisplayGroup[] {
  const groups: DisplayGroup[] = [];
  let lastDayKey: string | null = null;

  for (const msg of messages) {
    const isOwn = !!ownClerkId && msg.senderClerkId === ownClerkId;
    const authorColor = colorForUser(msg.senderClerkId);
    const dateObj = new Date(msg.createdAt);
    const dayKey = `${dateObj.getFullYear()}-${dateObj.getMonth()}-${dateObj.getDate()}`;
    const isNewDay = dayKey !== lastDayKey;
    lastDayKey = dayKey;

    const last = groups[groups.length - 1];
    const lastTs = last
      ? new Date(last.messages[last.messages.length - 1].createdAt).getTime()
      : 0;
    const sameAuthor =
      last &&
      last.authorClerkId === msg.senderClerkId &&
      dateObj.getTime() - lastTs < GROUP_WINDOW_MS &&
      !isNewDay;

    if (sameAuthor) {
      last!.messages.push(msg);
    } else {
      groups.push({
        authorClerkId: msg.senderClerkId,
        authorName: displayNameFor(msg.senderName, msg.senderEmail),
        authorAvatarUrl: msg.senderAvatarUrl,
        authorColor,
        isOwn,
        messages: [msg],
        dayLabel: isNewDay ? formatDayLabel(msg.createdAt) : null,
      });
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TypingDots() {
  // Three small bouncing dots. Staggered animation gives the classic
  // "iMessage / Slack" pulse without a custom keyframe.
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70"
          animate={{ y: [0, -3, 0] }}
          transition={{
            duration: 0.9,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.15,
          }}
        />
      ))}
    </span>
  );
}

function MessageStatusIcon({
  status,
  onRetry,
}: {
  status: ChatMessage['status'];
  onRetry?: () => void;
}) {
  if (status === 'sending') {
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/60" />;
  }
  if (status === 'failed') {
    return (
      <button
        onClick={onRetry}
        title="Retry"
        className="flex items-center gap-0.5 text-destructive transition-colors hover:text-destructive/80"
      >
        <AlertCircle className="h-3 w-3" />
        <RotateCcw className="h-3 w-3" />
      </button>
    );
  }
  return null;
}

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  isFirstInGroup: boolean;
  authorColor: string;
  onRetry: (clientId: string) => void;
  onStartEdit: (messageId: string) => void;
  onCancelEdit: () => void;
  onCommitEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onReply: (message: ChatMessage) => void;
  onJumpToParent: (parentId: string) => void;
  editingMessageId: string | null;
  /** Resolves a clerk-id to a stable accent color for mention highlighting. */
  mentionColorFor: (clerkId: string) => string;
}

/**
 * Inline edit composer used inside an existing bubble. Self-contained so we
 * keep its state local — entering edit mode for one message doesn't perturb
 * any other bubble's rendering.
 */
function InlineEdit({
  initialValue,
  onCancel,
  onCommit,
  accentColor,
}: {
  initialValue: string;
  onCancel: () => void;
  onCommit: (value: string) => void;
  accentColor: string;
}) {
  const [draft, setDraft] = useState(initialValue);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.focus();
    // Move caret to end so the user can keep typing without Ctrl+End.
    const len = ta.value.length;
    ta.setSelectionRange(len, len);
    // Auto-resize to content height (capped) so multi-line edits don't clip.
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, []);

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onCommit(draft);
      return;
    }
    // Plain Enter inserts newline (matches the user's mental model when
    // editing — they came in to *fix* something, not to send a new line).
  };

  return (
    <div
      className="rounded-2xl border border-border/60 bg-background/80 px-2.5 py-1.5"
      style={{ borderColor: `${accentColor}55` }}
    >
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const ta = e.currentTarget;
          ta.style.height = 'auto';
          ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
        }}
        onKeyDown={handleKey}
        rows={1}
        maxLength={1_000}
        aria-label="Edit message"
        className="w-full resize-none bg-transparent text-sm leading-relaxed focus:outline-none"
      />
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground/70">
        <span>Esc to cancel · ⌘/Ctrl+Enter to save</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-2 py-0.5 transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onCommit(draft)}
            disabled={!draft.trim() || draft === initialValue}
            className="rounded px-2 py-0.5 font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Reply quote header inside a bubble — Slack-style polish: micro-avatar,
 * accent left border, denser typography, and a HoverCard popover that
 * surfaces the full parent (avatar, name, timestamp, full excerpt) on hover.
 *
 * Clicking the quote scrolls to the parent if it's still in the DOM. We do
 * not look up the parent client-side beyond what the server snapshot gave
 * us — pagination may have dropped it, and the snapshot is the source of
 * truth at the time the reply was sent.
 *
 * The parent's avatar/name come from the server-resolved snapshot. We never
 * fall back to the live `messages` list for these fields, so a reply quote
 * stays honest even if the parent is later edited / deleted / paginated out.
 */
function ReplyQuote({
  parent,
  onJump,
}: {
  parent: NonNullable<ChatMessage['parent']>;
  onJump: () => void;
}) {
  const isDeleted = !!parent.deletedAt;
  const accent = parent.authorClerkId
    ? colorForUser(parent.authorClerkId)
    : undefined;
  const authorLabel = parent.authorName?.trim() || 'Unknown';
  const initial = authorLabel.charAt(0).toUpperCase();
  const excerpt = isDeleted
    ? '— message deleted —'
    : parent.contentExcerpt || '(empty message)';

  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={onJump}
          aria-label={`Reply to ${authorLabel}: ${excerpt}`}
          className={cn(
            'group/quote flex w-full max-w-full items-center gap-1.5 overflow-hidden rounded-md border-l-2 bg-muted/30 py-1 pl-2 pr-2 text-left text-[11px] leading-tight text-muted-foreground transition-colors hover:bg-muted/50',
            isDeleted && 'opacity-70',
          )}
          style={{ borderLeftColor: accent ?? 'hsl(var(--border))' }}
        >
          {/* Micro-avatar — same identity cue as the bubble's main avatar
              but in a 14px form factor that won't crowd the quote line. */}
          <Avatar
            className="h-3.5 w-3.5 shrink-0"
            style={{ boxShadow: accent ? `0 0 0 1px ${accent}55` : undefined }}
          >
            {parent.authorAvatarUrl ? (
              <AvatarImage src={parent.authorAvatarUrl} alt={authorLabel} />
            ) : null}
            <AvatarFallback
              className="text-[8px] font-semibold text-white"
              style={{ backgroundColor: accent ?? 'hsl(var(--muted-foreground))' }}
            >
              {initial}
            </AvatarFallback>
          </Avatar>
          <span
            className="shrink-0 font-semibold tracking-tight"
            style={{ color: accent }}
          >
            {authorLabel}
          </span>
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              isDeleted ? 'italic opacity-80' : 'opacity-80',
            )}
          >
            {excerpt}
          </span>
        </button>
      </HoverCardTrigger>

      {/* The popover renders the same excerpt unwrapped, plus the parent's
          timestamp and a click-to-jump affordance. We deliberately do NOT
          re-render markdown here (the excerpt is plain server text) — that
          keeps the preview consistent across all message types and avoids
          a second copy of MessageContent's parser tree on every hover. */}
      <HoverCardContent
        side="top"
        align="start"
        sideOffset={6}
        className="w-72 max-w-[80vw] p-3 text-xs"
      >
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6 shrink-0">
            {parent.authorAvatarUrl ? (
              <AvatarImage src={parent.authorAvatarUrl} alt={authorLabel} />
            ) : null}
            <AvatarFallback
              className="text-[10px] font-semibold text-white"
              style={{ backgroundColor: accent ?? 'hsl(var(--muted-foreground))' }}
            >
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-sm font-semibold"
              style={{ color: accent }}
            >
              {authorLabel}
            </div>
            <div className="text-[10px] text-muted-foreground/70">
              {formatDayLabel(parent.createdAt)} at{' '}
              {formatTime(parent.createdAt)}
            </div>
          </div>
        </div>
        <div
          className={cn(
            'mt-2 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-foreground/90',
            isDeleted && 'italic text-muted-foreground/70',
          )}
        >
          {excerpt}
        </div>
        <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground/60">
          <CornerUpLeft className="h-3 w-3" />
          <span>Click the quote to jump to this message.</span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function MessageBubble({
  message,
  isOwn,
  isFirstInGroup,
  authorColor,
  onRetry,
  onStartEdit,
  onCancelEdit,
  onCommitEdit,
  onDelete,
  onReply,
  onJumpToParent,
  editingMessageId,
  mentionColorFor,
}: MessageBubbleProps) {
  const isEditing = editingMessageId === message.id;
  const isDeleted = !!message.deletedAt;
  const isSent = message.status === 'sent';
  const canEditOrDelete = isOwn && isSent && !isDeleted && isWithinEditWindow(message);
  const mentions: ResolvedMention[] = Array.isArray(message.metadata?.mentions)
    ? message.metadata!.mentions!
    : [];

  // Bubble layout: keep the reply quote *inside* the bubble container so
  // keyboard tabbing flows naturally and the layout doesn't reflow when
  // entering edit mode.
  return (
    <div
      data-message-id={message.id}
      className={cn(
        'group/msg relative max-w-[85%]',
        isOwn ? 'self-end' : 'self-start',
      )}
    >
      {/* Action toolbar — visible on hover, only for own non-deleted recent messages. */}
      {canEditOrDelete && !isEditing && (
        <div
          className={cn(
            'pointer-events-none absolute -top-2 z-10 flex translate-y-[-100%] items-center gap-0.5 rounded-md border border-border/60 bg-background/95 p-0.5 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover/msg:pointer-events-auto group-hover/msg:opacity-100',
            // Transparent hover-bridge filling the 8px gap to the bubble.
            // Without it the cursor leaves all descendants of group/msg while
            // crossing the gap, hover un-fires, and the toolbar disappears
            // before the user can click any button. The bridge inherits
            // pointer-events from this div, so it is only interactive while
            // the toolbar itself is — no surprise hit zones when idle.
            'before:absolute before:inset-x-0 before:-bottom-2 before:h-2 before:content-[""]',
            isOwn ? 'right-1' : 'left-1',
          )}
          role="toolbar"
          aria-label="Message actions"
        >
          <button
            type="button"
            onClick={() => onReply(message)}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Reply"
            aria-label="Reply to message"
          >
            <CornerUpLeft className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onStartEdit(message.id)}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Edit (within 15 min)"
            aria-label="Edit message"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(message.id)}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            title="Delete (within 15 min)"
            aria-label="Delete message"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Reply toolbar for everyone else (no edit/delete shown). */}
      {!isOwn && !isDeleted && isSent && (
        <div
          className={cn(
            'pointer-events-none absolute -top-2 z-10 flex translate-y-[-100%] items-center rounded-md border border-border/60 bg-background/95 p-0.5 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover/msg:pointer-events-auto group-hover/msg:opacity-100',
            // See the canEditOrDelete toolbar above for why the bridge exists.
            'before:absolute before:inset-x-0 before:-bottom-2 before:h-2 before:content-[""]',
            'left-1',
          )}
          role="toolbar"
          aria-label="Message actions"
        >
          <button
            type="button"
            onClick={() => onReply(message)}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Reply"
            aria-label="Reply to message"
          >
            <CornerUpLeft className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Reply quote header — present iff this message replies to another. */}
      {message.parent && (
        <div className={cn('mb-1', isOwn ? 'pr-2' : 'pl-2')}>
          <ReplyQuote
            parent={message.parent}
            onJump={() => onJumpToParent(message.parent!.id)}
          />
        </div>
      )}

      {/* Bubble body — switches to inline edit when editing. */}
      {isEditing ? (
        <InlineEdit
          initialValue={message.content}
          accentColor={authorColor}
          onCancel={onCancelEdit}
          onCommit={(next) => onCommitEdit(message.id, next)}
        />
      ) : isDeleted ? (
        <div
          className={cn(
            'rounded-2xl border border-dashed border-border/50 bg-muted/20 px-3 py-1.5 text-xs italic text-muted-foreground/70',
          )}
          aria-label="Deleted message"
        >
          — message deleted —
        </div>
      ) : (
        <div
          className={cn(
            'rounded-2xl px-3 py-1.5 text-sm leading-relaxed break-words',
            'transition-opacity',
            message.status === 'sending' && 'opacity-60',
            message.status === 'failed' && 'border border-destructive/40 bg-destructive/5',
            isOwn
              ? 'border border-transparent text-foreground'
              : 'border border-border/40 bg-muted/40 text-foreground',
          )}
          style={
            isOwn && message.status !== 'failed'
              ? { backgroundColor: `${authorColor}1A` }
              : undefined
          }
        >
          <MessageContent
            value={message.content}
            mentions={mentions}
            colorForMention={mentionColorFor}
            paragraphClassName="whitespace-pre-wrap break-words text-sm leading-relaxed [&:not(:first-child)]:mt-2"
          />
          {/* "(edited)" footer — hover for original timestamp */}
          {message.editedAt && (
            <span
              className="ml-1 align-baseline text-[10px] text-muted-foreground/60"
              title={`Edited ${new Date(message.editedAt).toLocaleString()}`}
            >
              (edited)
            </span>
          )}
        </div>
      )}

      {/* Per-message footer for non-first messages: timestamp on hover */}
      {!isFirstInGroup && !isEditing && (
        <span
          className={cn(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 px-2 text-[10px] text-muted-foreground/0 transition-colors group-hover/msg:text-muted-foreground/60',
            isOwn ? 'right-full' : 'left-full',
          )}
        >
          {formatTime(message.createdAt)}
        </span>
      )}

      {/* Status icon */}
      {message.status !== 'sent' && !isEditing && (
        <div
          className={cn(
            'absolute -bottom-1 flex items-center',
            isOwn ? 'left-1' : 'right-1',
          )}
        >
          <MessageStatusIcon
            status={message.status}
            onRetry={
              message.status === 'failed' && message.clientId
                ? () => onRetry(message.clientId!)
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}

interface MessageGroupProps {
  group: DisplayGroup;
  onRetry: (clientId: string) => void;
  onStartEdit: (messageId: string) => void;
  onCancelEdit: () => void;
  onCommitEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  onReply: (message: ChatMessage) => void;
  onJumpToParent: (parentId: string) => void;
  editingMessageId: string | null;
  mentionColorFor: (clerkId: string) => string;
}

function MessageGroupView({
  group,
  onRetry,
  onStartEdit,
  onCancelEdit,
  onCommitEdit,
  onDelete,
  onReply,
  onJumpToParent,
  editingMessageId,
  mentionColorFor,
}: MessageGroupProps) {
  const { isOwn, authorColor, authorName, authorAvatarUrl, messages } = group;
  const initial = (authorName || 'U').charAt(0).toUpperCase();
  const firstTimestamp = formatTime(messages[0].createdAt);

  return (
    <div className="flex flex-col gap-0.5">
      {group.dayLabel && (
        <div className="my-2 flex items-center justify-center">
          <span className="rounded-full bg-muted/40 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
            {group.dayLabel}
          </span>
        </div>
      )}

      <div
        className={cn(
          'flex items-end gap-2',
          isOwn ? 'flex-row-reverse' : 'flex-row',
        )}
      >
        <div className="w-7 shrink-0">
          <Avatar
            className="h-7 w-7 ring-2 ring-background"
            style={{ boxShadow: `0 0 0 1.5px ${authorColor}` }}
          >
            {authorAvatarUrl ? (
              <AvatarImage src={authorAvatarUrl} alt={authorName} />
            ) : null}
            <AvatarFallback
              className="text-[10px] font-semibold text-white"
              style={{ backgroundColor: authorColor }}
            >
              {initial}
            </AvatarFallback>
          </Avatar>
        </div>

        <div
          className={cn(
            'flex min-w-0 flex-col gap-0.5',
            isOwn ? 'items-end' : 'items-start',
          )}
        >
          <div
            className={cn(
              'flex items-baseline gap-2 px-1 text-[11px]',
              isOwn ? 'flex-row-reverse' : 'flex-row',
            )}
          >
            <span
              className="font-medium"
              style={{ color: isOwn ? 'inherit' : authorColor }}
            >
              {isOwn ? 'You' : authorName}
            </span>
            <span className="text-muted-foreground/60">{firstTimestamp}</span>
          </div>

          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <motion.div
                key={msg.id || msg.clientId || idx}
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className={cn('w-full', isOwn ? 'flex justify-end' : 'flex justify-start')}
              >
                <MessageBubble
                  message={msg}
                  isOwn={isOwn}
                  isFirstInGroup={idx === 0}
                  authorColor={authorColor}
                  onRetry={onRetry}
                  onStartEdit={onStartEdit}
                  onCancelEdit={onCancelEdit}
                  onCommitEdit={onCommitEdit}
                  onDelete={onDelete}
                  onReply={onReply}
                  onJumpToParent={onJumpToParent}
                  editingMessageId={editingMessageId}
                  mentionColorFor={mentionColorFor}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(function ChatPanel({
  documentId,
  currentUser,
  collaborators,
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
  error,
}, forwardedRef) {
  const [input, setInput] = useState('');
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [pendingNewCount, setPendingNewCount] = useState(0);
  // Phase 2 — local UI state for edit / reply.
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  // Phase 2d — @mention autocomplete (caret tracking + Esc-dismiss gate).
  const [caretPos, setCaretPos] = useState(0);
  const [mentionEscDismissed, setMentionEscDismissed] = useState(false);
  const [mentionHighlight, setMentionHighlight] = useState(0);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);

  useImperativeHandle(forwardedRef, () => ({
    focusInput: () => textareaRef.current?.focus(),
  }), []);

  // Mention-color resolver — kept here so we don't recreate the closure on
  // every bubble render. Uses the same deterministic palette as cursors and
  // bubble accents so highlights line up visually.
  const mentionColorFor = useCallback(
    (clerkId: string) => colorForUser(clerkId),
    [],
  );

  const mentionCandidates = useMemo(
    () =>
      mergeAuthorsFromMessages(
        buildMentionCandidates(collaborators, currentUser?.id ?? null),
        messages,
        currentUser?.id ?? null,
      ),
    [currentUser?.id, collaborators, messages],
  );

  const retryMessageWithMentions = useCallback(
    (clientId: string) => {
      const target = messages.find((m) => m.clientId === clientId);
      if (!target) {
        retryMessage(clientId);
        return;
      }
      const ids = extractMentionClerkIdsFromContent(
        target.content,
        mentionCandidates,
      );
      retryMessage(clientId, { mentions: ids });
    },
    [messages, mentionCandidates, retryMessage],
  );

  const activeMention = useMemo(
    () => getActiveMentionAtCaret(input, caretPos),
    [input, caretPos],
  );

  const mentionSuggestions = useMemo(() => {
    if (!activeMention || mentionEscDismissed) return [];
    return filterMentionCandidates(mentionCandidates, activeMention.query).slice(
      0,
      MENTION_MENU_MAX,
    );
  }, [activeMention, mentionCandidates, mentionEscDismissed]);

  const isMentionMenuOpen =
    !!currentUser &&
    !!documentId &&
    !!activeMention &&
    !mentionEscDismissed &&
    mentionSuggestions.length > 0;

  useEffect(() => {
    if (!activeMention) setMentionEscDismissed(false);
  }, [activeMention]);

  useEffect(() => {
    setMentionHighlight(0);
  }, [activeMention?.query, activeMention?.atIndex, mentionEscDismissed]);

  const applyMentionSelection = useCallback((c: MentionCandidate) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const caret = ta.selectionStart ?? input.length;
    const live = getActiveMentionAtCaret(input, caret);
    if (!live) return;
    const { atIndex } = live;
    const before = input.slice(0, atIndex);
    const after = input.slice(caret);
    const insert = `@${displayNameToMentionToken(c.name)} `;
    const next = before + insert + after;
    setInput(next);
    setTyping(next.length > 0);
    setMentionEscDismissed(false);
    const nextCaret = before.length + insert.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(nextCaret, nextCaret);
      setCaretPos(nextCaret);
    });
  }, [input, setTyping]);

  // If the message we were editing is gone (paginated out, deleted by us
  // racing the server, etc.), drop the edit state to avoid a phantom open
  // composer with no anchor.
  useEffect(() => {
    if (!editingMessageId) return;
    const stillThere = messages.some((m) => m.id === editingMessageId);
    if (!stillThere) setEditingMessageId(null);
  }, [editingMessageId, messages]);

  // Same idea for the reply target: if the parent gets removed (deleted is
  // OK — we keep the quote — but a paginate-out is not), drop it.
  useEffect(() => {
    if (!replyTarget) return;
    const stillThere = messages.some((m) => m.id === replyTarget.id);
    if (!stillThere) setReplyTarget(null);
  }, [replyTarget, messages]);

  const startEdit = useCallback((messageId: string) => {
    setEditingMessageId(messageId);
  }, []);
  const cancelEdit = useCallback(() => setEditingMessageId(null), []);
  const commitEdit = useCallback(
    (messageId: string, content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      editMessage(messageId, trimmed);
      setEditingMessageId(null);
    },
    [editMessage],
  );
  const handleDelete = useCallback(
    (messageId: string) => {
      // No confirm dialog — within the 15-min window the user can re-send the
      // same content, and the tombstone is reversible-ish in practice. This
      // matches Slack/Discord muscle memory.
      deleteMessage(messageId);
    },
    [deleteMessage],
  );

  const handleReplyClick = useCallback((message: ChatMessage) => {
    setReplyTarget(message);
    // Focus the composer so the user can immediately start typing.
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);
  const cancelReply = useCallback(() => setReplyTarget(null), []);

  const jumpToParent = useCallback((parentId: string) => {
    const el = scrollerRef.current?.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(parentId)}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Brief highlight pulse so the user can see what we jumped to.
      el.classList.add('ring-2', 'ring-primary/40');
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-primary/40');
      }, 1_200);
    }
  }, []);

  // Auto-resize textarea (capped, then scrolls).
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [input]);

  // Compute display groups once per messages change.
  const groups = useMemo(
    () => groupMessages(messages, currentUser?.id || null),
    [messages, currentUser?.id],
  );

  // Online count — exclude the current user from the collaborators tally.
  const onlineOthers = useMemo(
    () => collaborators.filter((c) => c.user.id !== currentUser?.id).length,
    [collaborators, currentUser?.id],
  );

  // Filter typing users to remove ourselves. We compare by stable Clerk id
  // (server emits `userClerkId` on chat:typing) rather than by display name —
  // a name match is unreliable when users haven't synced a profile yet and
  // both sides come back blank/identical.
  const visibleTypingUsers = useMemo(() => {
    return typingUsers
      .filter((t) => !currentUser || t.userClerkId !== currentUser.id)
      .slice(0, 3);
  }, [typingUsers, currentUser]);

  // Scroll listener — track whether the user is "near" the bottom so we know
  // whether to autoscroll on new messages.
  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const threshold = 80;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < threshold;
    setIsAtBottom(atBottom);
    if (atBottom) setPendingNewCount(0);

    // Infinite scroll up — load older messages when near the top.
    if (el.scrollTop < 60 && hasMore && !isLoading) {
      const prevHeight = el.scrollHeight;
      void loadMore().then(() => {
        // Preserve scroll position relative to existing content after older
        // messages get prepended.
        requestAnimationFrame(() => {
          if (!scrollerRef.current) return;
          const delta = scrollerRef.current.scrollHeight - prevHeight;
          scrollerRef.current.scrollTop = scrollerRef.current.scrollTop + delta;
        });
      });
    }
  }, [hasMore, isLoading, loadMore]);

  // Autoscroll to bottom when new messages arrive — but only if the user
  // is already at the bottom. Otherwise, count them up so we can show a pill.
  useLayoutEffect(() => {
    const last = messages[messages.length - 1];
    const lastId = last?.id || last?.clientId || null;
    if (lastId === lastMessageIdRef.current) return;

    const isNewLast = !!lastId && lastMessageIdRef.current !== null;
    lastMessageIdRef.current = lastId;

    if (!isNewLast) {
      // First population: jump to bottom without animation. State is already
      // at its initial values (isAtBottom=true, pendingNewCount=0), so we
      // intentionally skip setState here to avoid a cascading render.
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      return;
    }

    const isOwn = last?.senderClerkId === currentUser?.id;
    if (isAtBottom || isOwn) {
      // Either user is already at the bottom, or this is our own outgoing
      // message — pull view to bottom.
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      // Counter accumulates incoming-message events while the user is scrolled
      // up — this is a textbook case of "synchronize external events into local
      // state" that the lint rule mis-flags as a cascading render. The functional
      // updater form keeps the update referentially safe.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingNewCount((c) => c + 1);
    }
  }, [messages, isAtBottom, currentUser?.id]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setPendingNewCount(0);
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const ids = extractMentionClerkIdsFromContent(trimmed, mentionCandidates);
    const mentionHints: ResolvedMention[] = ids.map((clerkId) => ({
      clerkId,
      name: mentionCandidates.find((c) => c.clerkId === clerkId)?.name ?? null,
    }));
    sendMessage(trimmed, {
      parentId: replyTarget?.id ?? null,
      mentions: ids,
      mentionHints,
    });
    setInput('');
    setCaretPos(0);
    setTyping(false);
    setReplyTarget(null);
    requestAnimationFrame(() =>
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' }),
    );
  }, [input, sendMessage, setTyping, replyTarget, mentionCandidates]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const caret = ta.selectionStart ?? input.length;
    const liveMention = getActiveMentionAtCaret(input, caret);
    const liveSuggestions =
      liveMention && !mentionEscDismissed
        ? filterMentionCandidates(mentionCandidates, liveMention.query).slice(
            0,
            MENTION_MENU_MAX,
          )
        : [];

    if (liveSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionHighlight((i) => (i + 1) % liveSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionHighlight(
          (i) => (i - 1 + liveSuggestions.length) % liveSuggestions.length,
        );
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
        e.preventDefault();
        const pick =
          liveSuggestions[
            Math.min(mentionHighlight, liveSuggestions.length - 1)
          ];
        if (pick) applyMentionSelection(pick);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionEscDismissed(true);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    // Esc cancels reply target if one is active (and the mention menu is not
    // intercepting above). The input value itself is preserved.
    if (e.key === 'Escape' && replyTarget) {
      e.preventDefault();
      cancelReply();
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setInput(v);
    setCaretPos(e.target.selectionStart ?? v.length);
    setTyping(v.length > 0);
  };

  const accent = currentUser ? colorForUser(currentUser.id) : '#6366f1';
  const isEmpty = messages.length === 0 && !isLoading;
  const charsRemaining = 1_000 - input.length;

  // ---------------------------------------------------------------------------

  return (
    <section
      role="region"
      aria-label="Document chat"
      className="flex h-full flex-col bg-card"
    >
      {/* Header — glass + online count, mirrors AIAssistantPanel context bar. */}
      <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 px-4 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5" />
          <span>Messages</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          <span>
            {onlineOthers === 0
              ? 'Just you'
              : `${onlineOthers + 1} online`}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Chat messages"
        className="relative flex-1 overflow-y-auto px-4 py-3"
      >
        {hasMore && (
          <div className="flex justify-center pb-2">
            <button
              onClick={() => void loadMore()}
              disabled={isLoading}
              className="text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground disabled:opacity-50"
            >
              {isLoading ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        )}

        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <MessageSquare className="h-6 w-6 text-primary/70" />
            </div>
            <div>
              <p className="text-sm font-medium">No messages yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Talk to your collaborators in real time. Messages are saved with
                this document.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map((group, idx) => (
              <MessageGroupView
                key={`${group.authorClerkId || 'anon'}-${group.messages[0].id || group.messages[0].clientId || idx}`}
                group={group}
                onRetry={retryMessageWithMentions}
                onStartEdit={startEdit}
                onCancelEdit={cancelEdit}
                onCommitEdit={commitEdit}
                onDelete={handleDelete}
                onReply={handleReplyClick}
                onJumpToParent={jumpToParent}
                editingMessageId={editingMessageId}
                mentionColorFor={mentionColorFor}
              />
            ))}

            {/* Other-user typing indicator */}
            <AnimatePresence>
              {visibleTypingUsers.length > 0 && (
                <motion.div
                  key="typing"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-2 px-1 text-xs text-muted-foreground"
                >
                  <div className="rounded-2xl border border-border/40 bg-muted/40 px-3 py-2">
                    <TypingDots />
                  </div>
                  <span>
                    {visibleTypingUsers.length === 1
                      ? `${displayNameFor(visibleTypingUsers[0].userName, null)} is typing`
                      : `${visibleTypingUsers
                          .map((u) => displayNameFor(u.userName, null))
                          .join(', ')} are typing`}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* "Jump to latest" pill */}
      <AnimatePresence>
        {!isAtBottom && pendingNewCount > 0 && (
          <motion.button
            key="jump"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.18 }}
            onClick={scrollToBottom}
            className="pointer-events-auto absolute bottom-[88px] left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-[1.03]"
          >
            <ArrowDown className="h-3 w-3" />
            {pendingNewCount} new {pendingNewCount === 1 ? 'message' : 'messages'}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="border-t border-border p-3">
        {/* Phase 2 — reply target strip. Renders above the input when the
            user has chosen to reply to a specific message. Cancel via X or
            Esc on the textarea. */}
        <AnimatePresence>
          {replyTarget && (
            <motion.div
              key="reply-strip"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="mb-2 flex items-center gap-2 overflow-hidden rounded-md border-l-2 bg-muted/40 px-2 py-1.5 text-xs"
              style={{
                borderLeftColor: replyTarget.senderClerkId
                  ? colorForUser(replyTarget.senderClerkId)
                  : undefined,
              }}
            >
              {/* Mini-avatar mirrors the in-bubble ReplyQuote so the user
                  visually identifies the same person they're replying to. */}
              {(() => {
                const replyAccent = replyTarget.senderClerkId
                  ? colorForUser(replyTarget.senderClerkId)
                  : undefined;
                const replyName = displayNameFor(
                  replyTarget.senderName,
                  replyTarget.senderEmail,
                );
                const replyInitial = replyName.charAt(0).toUpperCase();
                return (
                  <Avatar
                    className="h-4 w-4 shrink-0"
                    style={{
                      boxShadow: replyAccent
                        ? `0 0 0 1px ${replyAccent}55`
                        : undefined,
                    }}
                  >
                    {replyTarget.senderAvatarUrl ? (
                      <AvatarImage
                        src={replyTarget.senderAvatarUrl}
                        alt={replyName}
                      />
                    ) : null}
                    <AvatarFallback
                      className="text-[8px] font-semibold text-white"
                      style={{
                        backgroundColor:
                          replyAccent ?? 'hsl(var(--muted-foreground))',
                      }}
                    >
                      {replyInitial}
                    </AvatarFallback>
                  </Avatar>
                );
              })()}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5 truncate">
                  <span className="text-muted-foreground/80">Replying to</span>
                  <span
                    className="truncate font-medium"
                    style={{
                      color: replyTarget.senderClerkId
                        ? colorForUser(replyTarget.senderClerkId)
                        : undefined,
                    }}
                  >
                    {displayNameFor(replyTarget.senderName, replyTarget.senderEmail)}
                  </span>
                </div>
                <div className="truncate italic text-muted-foreground/70">
                  {replyTarget.deletedAt
                    ? '— message deleted —'
                    : replyTarget.content.slice(0, 140)}
                </div>
              </div>
              <button
                type="button"
                onClick={cancelReply}
                aria-label="Cancel reply"
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className="flex items-end gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 transition-colors focus-within:bg-background/50"
          style={{ borderColor: input ? `${accent}55` : undefined }}
        >
          <div className="relative min-w-0 flex-1">
            {isMentionMenuOpen && (
              <ul
                id="chat-mention-listbox"
                role="listbox"
                aria-label="Mention someone"
                className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-48 overflow-y-auto rounded-lg border border-border/60 bg-popover py-1 text-popover-foreground shadow-lg"
              >
                {mentionSuggestions.map((c, idx) => {
                  const rowColor = colorForUser(c.clerkId);
                  const initial = (c.name || 'U').charAt(0).toUpperCase();
                  return (
                    <li key={c.clerkId} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={idx === mentionHighlight}
                        className={cn(
                          'flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors',
                          idx === mentionHighlight ? 'bg-muted' : 'hover:bg-muted/60',
                        )}
                        onMouseEnter={() => setMentionHighlight(idx)}
                        onMouseDown={(ev) => {
                          ev.preventDefault();
                          applyMentionSelection(c);
                        }}
                      >
                        <Avatar className="h-6 w-6 shrink-0 ring-1 ring-border/50">
                          {c.avatarUrl ? (
                            <AvatarImage src={c.avatarUrl} alt="" />
                          ) : null}
                          <AvatarFallback
                            className="text-[10px] font-semibold text-white"
                            style={{ backgroundColor: rowColor }}
                          >
                            {initial}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {c.name}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onSelect={(e) => {
                setCaretPos(e.currentTarget.selectionStart ?? 0);
              }}
              onKeyDown={handleKeyDown}
              aria-controls={
                isMentionMenuOpen ? 'chat-mention-listbox' : undefined
              }
              aria-expanded={isMentionMenuOpen}
              aria-autocomplete={isMentionMenuOpen ? 'list' : undefined}
              placeholder={
                currentUser
                  ? `Message your collaborators…`
                  : 'Sign in to chat'
              }
              disabled={!currentUser || !documentId}
              rows={1}
              maxLength={1_000}
              aria-label="Chat message"
              className="w-full flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
            />
          </div>
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || !currentUser}
            className="h-7 w-7 shrink-0"
            title="Send (Enter)"
            style={
              input.trim()
                ? { backgroundColor: accent, color: 'white' }
                : undefined
            }
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="mt-1.5 flex items-center justify-between px-1 text-[10px] text-muted-foreground/40">
          <span>Enter to send · Shift+Enter newline · @mention</span>
          {input.length > 0 && (
            <span
              className={cn(
                charsRemaining < 50 && 'text-warning',
                charsRemaining < 0 && 'text-destructive',
              )}
            >
              {charsRemaining}
            </span>
          )}
        </div>
      </div>
    </section>
  );
});

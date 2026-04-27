/**
 * Phase 2d — document chat @mentions.
 *
 * - Autocomplete inserts `@Display_Name_With_Underscores` so the existing
 *   MessageContent mention pass (which maps `_`/`.` → space for lookup) can
 *   resolve highlights against server-validated `metadata.mentions`.
 * - On send we extract distinct clerk ids from `@tokens` in the final text
 *   and ship them to the server; unknown tokens are ignored (no highlight).
 */

import type { ChatMessage } from '@/hooks/useDocumentChat';
import type { User, UserPresence } from '@/types';

export interface MentionCandidate {
  clerkId: string;
  /** Trimmed display name */
  name: string;
  nameLower: string;
  avatarUrl?: string | null;
}

function fallbackDisplayName(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed) return trimmed;
  if (typeof email === 'string' && email.includes('@')) {
    const local = email.split('@')[0]?.trim();
    if (local) return local;
  }
  return '';
}

/**
 * Space → underscore so the @token stays a single MessageContent segment.
 */
export function displayNameToMentionToken(name: string): string {
  return name.trim().replace(/\s+/g, '_');
}

/** Normalized map key for a person's display name (lowercase, collapsed spaces). */
export function comparableDisplayName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Same normalization MessageContent uses for the second lookup path. */
export function comparableFromMentionRawToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildMentionCandidates(
  collaborators: UserPresence[],
  /** Clerk id of the current user — never offer self in @ autocomplete. */
  excludeClerkId?: string | null,
): MentionCandidate[] {
  const map = new Map<string, MentionCandidate>();

  const addUser = (user: User) => {
    if (excludeClerkId && user.id === excludeClerkId) return;
    const name = fallbackDisplayName(user.name, user.email);
    if (!name || !user.id) return;
    if (map.has(user.id)) return;
    map.set(user.id, {
      clerkId: user.id,
      name,
      nameLower: name.toLowerCase(),
      avatarUrl: user.imageUrl ?? null,
    });
  };

  for (const c of collaborators) addUser(c.user);

  return [...map.values()];
}

/**
 * Include people who appear in message history so you can @mention someone
 * who is no longer in the presence list (e.g. tab closed), as long as they
 * sent a message in the loaded window.
 */
export function mergeAuthorsFromMessages(
  base: MentionCandidate[],
  messages: ChatMessage[],
  /** Omit the current user from history-derived candidates as well. */
  excludeClerkId?: string | null,
): MentionCandidate[] {
  const map = new Map(base.map((c) => [c.clerkId, c]));
  for (const m of messages) {
    if (!m.senderClerkId) continue;
    if (excludeClerkId && m.senderClerkId === excludeClerkId) continue;
    if (map.has(m.senderClerkId)) continue;
    const name = fallbackDisplayName(m.senderName, m.senderEmail);
    if (!name) continue;
    map.set(m.senderClerkId, {
      clerkId: m.senderClerkId,
      name,
      nameLower: name.toLowerCase(),
      avatarUrl: m.senderAvatarUrl ?? null,
    });
  }
  return [...map.values()];
}

const MENTION_TOKEN_IN_TEXT_RE = /@([\p{L}\p{N}_.-]+)/gu;

/**
 * Scan `content` for @tokens and map each to a clerk id when the token
 * resolves to exactly one loaded candidate's display name.
 */
export function extractMentionClerkIdsFromContent(
  content: string,
  candidates: MentionCandidate[],
): string[] {
  const nameToId = new Map<string, string>();
  for (const c of candidates) {
    nameToId.set(comparableDisplayName(c.name), c.clerkId);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  MENTION_TOKEN_IN_TEXT_RE.lastIndex = 0;
  while ((m = MENTION_TOKEN_IN_TEXT_RE.exec(content)) !== null) {
    const comparable = comparableFromMentionRawToken(m[1]);
    const id = nameToId.get(comparable);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function filterMentionCandidates(
  candidates: MentionCandidate[],
  query: string,
): MentionCandidate[] {
  const q = query.trim().toLowerCase();
  if (!q) return candidates;
  return candidates.filter((c) => {
    const token = displayNameToMentionToken(c.name).toLowerCase();
    if (token.startsWith(q)) return true;
    if (c.nameLower.startsWith(q)) return true;
    return false;
  });
}

/**
 * If the caret sits immediately after an `@` that starts a mention token,
 * returns the index of `@` and the raw query between `@` and the caret.
 */
export function getActiveMentionAtCaret(
  value: string,
  caret: number,
): { atIndex: number; query: string } | null {
  if (caret < 1) return null;
  let pos = caret - 1;
  while (pos >= 0) {
    const ch = value[pos];
    if (ch === '@') {
      const atIndex = pos;
      const before = atIndex > 0 ? value[atIndex - 1] : '';
      if (before !== '' && before !== ' ' && before !== '\n') {
        return null;
      }
      const query = value.slice(atIndex + 1, caret);
      if (/\s/.test(query)) return null;
      if (query.length > 0 && !/^[\p{L}\p{N}_.-]*$/u.test(query)) return null;
      return { atIndex, query };
    }
    if (ch === ' ' || ch === '\n') return null;
    if (!/^[\p{L}\p{N}_.-]$/u.test(ch)) return null;
    pos--;
  }
  return null;
}

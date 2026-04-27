/**
 * Phase 2 — shared chat-message renderer.
 *
 * A small, dependency-free markdown renderer tailored to chat content.
 * Designed so the public surface (`<MessageContent value=… mentions=… />`)
 * stays identical when we eventually swap the body for `react-markdown` +
 * `remark-gfm` + `rehype-sanitize` (see docs/hardening/PHASE_2.md).
 *
 * Supported syntax:
 *   - **bold**         → <strong>
 *   - *italic*, _italic_ → <em>
 *   - ~~strikethrough~~ → <s>
 *   - `inline code`    → <code>
 *   - ```fenced code``` → CodeBlock with copy-to-clipboard
 *   - http(s):// and mailto: URLs auto-link
 *   - @mentions render highlighted iff the name matches a server-resolved
 *     mention in `props.mentions` (defense-in-depth: a malicious sender
 *     can't make arbitrary `@text` light up).
 *
 * Out of scope (deliberate, see Phase 2 doc):
 *   - tables, footnotes, nested lists, multi-line blockquotes, raw HTML.
 */

import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MessageContentMention {
  /** Stable Clerk id — used as the deterministic-color key. */
  clerkId: string;
  /** Display name resolved server-side; falls back to clerkId if missing. */
  name: string | null;
}

export interface MessageContentProps {
  value: string;
  /**
   * Mentions resolved by the server. Only names in this list will be
   * rendered as highlighted spans; everything else stays plain text.
   */
  mentions?: MessageContentMention[];
  /**
   * Optional mapping clerkId → accent color, used to tint the mention
   * highlight. When omitted we use a single neutral accent.
   */
  colorForMention?: (clerkId: string) => string;
  className?: string;
  /** Additional class on every paragraph; kept lean so callers can theme. */
  paragraphClassName?: string;
}

// ---------------------------------------------------------------------------
// CodeBlock — fenced ```...``` renderer with copy-to-clipboard.
// ---------------------------------------------------------------------------

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      // Clipboard rejection (e.g. permission denied in iframe) is a soft
      // failure — the code is still visible and selectable.
    }
  };
  return (
    <div className="my-2 overflow-hidden rounded-md border border-border/60 bg-[#1e1e1e] text-xs">
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/30 px-2.5 py-1">
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {lang || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-green-500" />
              <span className="text-green-500">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-2 font-mono text-[11px] leading-relaxed text-slate-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// URL helpers — only http(s) and mailto pass through. Everything else falls
// back to plain text. We never use dangerouslySetInnerHTML, so XSS via raw
// HTML is impossible; this guards against `javascript:` URL injection
// specifically.
// ---------------------------------------------------------------------------

const URL_RE = /https?:\/\/[^\s<>()]+|mailto:[^\s<>()]+/g;
function isSafeUrl(url: string) {
  return /^(https?:|mailto:)/i.test(url);
}

// ---------------------------------------------------------------------------
// Inline tokenizer
//
// We process text in **passes** to avoid the combinatorial explosion of one
// monolithic regex:
//   1. Split on URLs first so a URL inside emphasis markers (e.g. *foo*)
//      doesn't get mis-tokenized.
//   2. Apply the inline-formatter recursively to the remaining text-only
//      segments.
//
// The recursion is bounded — inline code (`...`) and emphasis don't nest,
// so we hit a base case quickly.
// ---------------------------------------------------------------------------

function renderUrls(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  text.replace(URL_RE, (match, offset: number) => {
    if (offset > last) {
      out.push(...renderInline(text.slice(last, offset), `${key++}-pre`));
    }
    if (isSafeUrl(match)) {
      out.push(
        <a
          key={`url-${key++}-${offset}`}
          href={match}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
        >
          {match}
        </a>,
      );
    } else {
      out.push(match);
    }
    last = offset + match.length;
    return match;
  });
  if (last < text.length) {
    out.push(...renderInline(text.slice(last), `${key++}-tail`));
  }
  return out;
}

// Order matters here:
//   1. inline code (`...`)  — protects backtick contents from emphasis splits
//   2. bold (**...**)
//   3. strikethrough (~~...~~)
//   4. italic (*..* or _.._)
const INLINE_RE =
  /(`[^`\n]+`|\*\*[^*\n]+\*\*|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/;

function renderInline(text: string, keyPrefix = 'i'): ReactNode[] {
  if (!text) return [];
  const parts = text.split(INLINE_RE);
  return parts.map((part, i) => {
    const k = `${keyPrefix}-${i}`;
    if (!part) return null;
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={k}
          className="rounded bg-muted/70 px-1 py-0.5 font-mono text-[12px] text-foreground"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={k}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('~~') && part.endsWith('~~')) {
      return <s key={k}>{part.slice(2, -2)}</s>;
    }
    if (
      (part.startsWith('*') && part.endsWith('*')) ||
      (part.startsWith('_') && part.endsWith('_'))
    ) {
      return <em key={k}>{part.slice(1, -1)}</em>;
    }
    // Plain text segment — return as-is. Note we do not split on \n here;
    // newline → <br> is handled at the paragraph level so empty trailing
    // newlines don't render bonus blank lines.
    return part;
  });
}

// ---------------------------------------------------------------------------
// Mentions — applied as a *post-pass* over already-formatted nodes so the
// @mention syntax doesn't get eaten by emphasis/code matchers. We only
// highlight names that appear in `mentions` (server-validated).
// ---------------------------------------------------------------------------

const MENTION_RE = /(@[\p{L}\p{N}_.-]+)/gu;

function applyMentions(
  nodes: ReactNode[],
  byName: Map<string, MessageContentMention>,
  colorForMention: ((clerkId: string) => string) | undefined,
  keyPrefix: string,
): ReactNode[] {
  if (byName.size === 0) return nodes;
  const out: ReactNode[] = [];
  let counter = 0;
  for (const node of nodes) {
    if (typeof node !== 'string') {
      out.push(node);
      continue;
    }
    const segments = node.split(MENTION_RE);
    for (const seg of segments) {
      if (!seg) continue;
      if (seg.startsWith('@')) {
        const handle = seg.slice(1);
        // Case-insensitive match against the server-validated list. Names
        // can contain spaces in our app, so we also accept dot/underscore
        // condensed forms — but the strict source of truth stays the
        // server's `mentions` list.
        const hit =
          byName.get(handle.toLowerCase()) ||
          byName.get(handle.replace(/[._]/g, ' ').toLowerCase());
        if (hit) {
          const color = colorForMention?.(hit.clerkId);
          out.push(
            <span
              key={`mention-${keyPrefix}-${counter++}`}
              data-mention-clerk-id={hit.clerkId}
              className="rounded px-1 font-medium text-primary"
              style={
                color
                  ? { color, backgroundColor: `${color}1A` }
                  : undefined
              }
            >
              {seg}
            </span>,
          );
          continue;
        }
      }
      out.push(seg);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Block parser — splits on fenced code blocks, then renders paragraphs.
//
// "Paragraphs" here are any run of non-empty lines; a blank line ends the
// paragraph. Single newlines inside a paragraph become <br>. This matches
// what users intuit when they hit Shift+Enter mid-message.
// ---------------------------------------------------------------------------

const FENCE_RE = /```([^\n]*)\n([\s\S]*?)```/g;

function renderBlocks(
  value: string,
  byName: Map<string, MessageContentMention>,
  colorForMention: ((clerkId: string) => string) | undefined,
  paragraphClassName: string | undefined,
): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;

  const pushPlainBlock = (text: string) => {
    if (!text.trim()) return;
    // Split into paragraphs (>=1 blank line separator).
    const paras = text.split(/\n{2,}/);
    paras.forEach((para, i) => {
      const trimmedPara = para.trimEnd();
      if (!trimmedPara) return;
      // Render each line, joined by <br>.
      const lines = trimmedPara.split('\n');
      const nodes: ReactNode[] = [];
      lines.forEach((line, j) => {
        if (j > 0) nodes.push(<br key={`br-${key}-${i}-${j}`} />);
        const inlineNodes = renderUrls(line);
        nodes.push(
          ...applyMentions(inlineNodes, byName, colorForMention, `m-${key}-${i}-${j}`),
        );
      });
      out.push(
        <p
          key={`p-${key++}-${i}`}
          className={paragraphClassName ?? 'whitespace-pre-wrap break-words text-sm leading-relaxed'}
        >
          {nodes}
        </p>,
      );
    });
  };

  let match: RegExpExecArray | null;
  // Reset lastIndex because /g regexes are stateful per-instance.
  FENCE_RE.lastIndex = 0;
  while ((match = FENCE_RE.exec(value)) !== null) {
    const [full, lang, code] = match;
    if (match.index > last) {
      pushPlainBlock(value.slice(last, match.index));
    }
    out.push(
      <CodeBlock
        key={`code-${key++}-${match.index}`}
        lang={(lang || '').trim()}
        code={code.replace(/\n$/, '')}
      />,
    );
    last = match.index + full.length;
  }
  if (last < value.length) {
    pushPlainBlock(value.slice(last));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function MessageContent({
  value,
  mentions,
  colorForMention,
  className,
  paragraphClassName,
}: MessageContentProps) {
  // Build a name → mention map once per render. The map is keyed by the
  // *display name* (lowercased) because that's what users actually type
  // after `@`. We never trust `value` to determine which mentions are
  // valid — the server-validated `mentions` list is the source of truth.
  const byName = new Map<string, MessageContentMention>();
  for (const m of mentions ?? []) {
    if (typeof m?.name === 'string' && m.name.trim()) {
      byName.set(m.name.trim().toLowerCase(), m);
    }
  }

  return (
    <div className={className}>
      {renderBlocks(value, byName, colorForMention, paragraphClassName)}
    </div>
  );
}

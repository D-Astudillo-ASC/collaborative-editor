/**
 * Text-normalization utilities used wherever the server accepts user-typed
 * content (chat, AI prompts, document titles, etc).
 *
 * Goals:
 *   1. Predictable display: collapse exotic Unicode that renders as
 *      invisible / RTL-overriding / lookalike characters.
 *   2. Predictable storage: NFC-normalize so equivalent compositions
 *      compare equal in Postgres.
 *   3. Bounded blast radius: cap length and collapse runs of blank lines
 *      so a single message cannot eat a panel.
 *
 * Returning the cleaned string + a `changed` flag (rather than just the
 * string) lets callers log when a message had to be sanitized — useful
 * for spotting abuse without writing a separate audit pipe.
 */

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF\u00AD\u2060]/g;
const RTL_OVERRIDE_RE = /\u202E/g;
const BIDI_ISOLATE_RE = /[\u2066-\u2069]/g;
const C0_C1_CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const MULTI_BLANK_RE = /\n{3,}/g;

/**
 * Strip invisible and control characters from a string. Used as a building
 * block by `normalizeUserText` and also exported for callers that only need
 * the security pass (e.g. AI input where length / NFC concerns are handled
 * elsewhere).
 */
export function stripInvisibleChars(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(ZERO_WIDTH_RE, '')
    .replace(RTL_OVERRIDE_RE, '')
    .replace(BIDI_ISOLATE_RE, '')
    .replace(C0_C1_CONTROL_RE, '');
}

/**
 * Normalize a single user-typed text payload before persistence.
 *
 * @param {string} input
 * @param {{ max?: number }} [opts]
 * @returns {{ value: string, changed: boolean, truncated: boolean }}
 */
export function normalizeUserText(input, opts = {}) {
  const max = typeof opts.max === 'number' ? opts.max : Infinity;
  if (typeof input !== 'string') {
    return { value: '', changed: true, truncated: false };
  }

  const original = input;
  let v = input;

  // Unicode normalization first so equivalent compositions sort/compare equal.
  v = v.normalize('NFC');

  // Strip invisible / control characters.
  v = stripInvisibleChars(v);

  // Collapse 3+ consecutive newlines into 2 (one blank line).
  v = v.replace(MULTI_BLANK_RE, '\n\n');

  // Trim leading/trailing whitespace.
  v = v.trim();

  let truncated = false;
  if (v.length > max) {
    v = v.slice(0, max);
    truncated = true;
  }

  return {
    value: v,
    changed: v !== original,
    truncated,
  };
}

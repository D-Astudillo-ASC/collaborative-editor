/**
 * Configurable, atomic, Redis-Lua sliding-window rate limiter.
 *
 * One process-wide instance per logical surface (chat, AI, execution).
 * Each instance owns a key namespace, a window, and a max count, so
 * different surfaces never collide.
 *
 * Atomicity:
 *   The check-and-add path is a single Redis Lua script. Concurrent
 *   requests on the same key cannot interleave the check with the add,
 *   so the limit cannot be bypassed under contention.
 *
 * Failure mode:
 *   On Redis unavailability the limiter fails CLOSED for the surfaces
 *   that pass `failClosed: true` (e.g. code execution, billable AI calls).
 *   For chat we default to fail-open: a brief Redis blip should not stop
 *   conversation. This is a deliberate per-surface trade-off.
 */

import { redisConnection } from './redis.js';

// Lua script — see queue.js for the original derivation.
// Returns: [allowed (1|0), currentCount, remaining, resetAt]
const CHECK_LIMIT_SCRIPT = `
  local key = KEYS[1]
  local now = tonumber(ARGV[1])
  local windowStart = tonumber(ARGV[2])
  local maxRequests = tonumber(ARGV[3])
  local windowMs = tonumber(ARGV[4])
  local entryId = ARGV[5]

  redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)

  local count = redis.call('ZCARD', key)

  if count >= maxRequests then
    local resetAt = now + windowMs
    redis.call('EXPIRE', key, math.ceil(windowMs / 1000))
    return {0, count, 0, resetAt}
  end

  redis.call('ZADD', key, now, entryId)
  redis.call('EXPIRE', key, math.ceil(windowMs / 1000))

  local newCount = count + 1
  local remaining = maxRequests - newCount
  local resetAt = now + windowMs
  return {1, newCount, remaining, resetAt}
`;

export class RateLimiter {
  /**
   * @param {object} opts
   * @param {string} opts.namespace      Redis key prefix, e.g. "rate_limit:chat".
   * @param {number} opts.windowMs       Sliding window length in ms.
   * @param {number} opts.max            Max requests per window per identity.
   * @param {boolean} [opts.failClosed]  On Redis errors, deny instead of allow.
   *                                     Default: false (fail-open).
   * @param {object} [opts.redis]        Optional injected client. Default: shared.
   */
  constructor({ namespace, windowMs, max, failClosed = false, redis }) {
    if (!namespace) throw new Error('RateLimiter: namespace is required');
    if (!windowMs)  throw new Error('RateLimiter: windowMs is required');
    if (!max)       throw new Error('RateLimiter: max is required');

    this.namespace = namespace;
    this.windowMs = windowMs;
    this.max = max;
    this.failClosed = failClosed;
    this.redis = redis || redisConnection;
    this.scriptSha = null;
  }

  /**
   * @param {string} identity Stable per-user / per-IP key fragment.
   * @returns {Promise<{ allowed: boolean, remaining: number, resetAt: number, error?: string }>}
   */
  async check(identity) {
    const key = `${this.namespace}:${identity}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const entryId = `${now}-${Math.random().toString(36).slice(2, 11)}`;

    try {
      if (!this.scriptSha) {
        this.scriptSha = await this.redis.script('LOAD', CHECK_LIMIT_SCRIPT);
      }

      const result = await this.redis.evalsha(
        this.scriptSha,
        1,
        key,
        now.toString(),
        windowStart.toString(),
        this.max.toString(),
        this.windowMs.toString(),
        entryId,
      );

      const [allowedFlag, , remaining, resetAt] = result;
      return {
        allowed: allowedFlag === 1,
        remaining,
        resetAt,
      };
    } catch (err) {
      if (err?.message?.includes('NOSCRIPT')) {
        this.scriptSha = null;
        return this.check(identity);
      }
      console.error(`[RateLimiter:${this.namespace}] Redis error:`, err?.message || err);
      if (this.failClosed) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: now + this.windowMs,
          error: 'rate limiter temporarily unavailable',
        };
      }
      // Fail open — degraded but conversational.
      return { allowed: true, remaining: this.max - 1, resetAt: now + this.windowMs };
    }
  }
}

// ---------------------------------------------------------------------------
// Pre-configured limiters used across the app. Tune values here so changes
// flow through every consumer.
// ---------------------------------------------------------------------------

/**
 * Document chat send. Per-user (DB id). Multi-tab safe.
 * Replaces the per-socket in-memory limiter that lived in server/index.js.
 */
export const chatLimiter = new RateLimiter({
  namespace: 'rate_limit:chat',
  windowMs: 5_000,
  max: 10,
  failClosed: false,
});

/**
 * AI requests. Per-user (DB id). Replaces the in-memory limiter in ai.js
 * which keyed off `req.auth?.userId` — a value that is never set, so the
 * old limiter collapsed to a single global "anonymous" key. See
 * docs/hardening/PHASE_1.md for the bug write-up.
 */
export const aiLimiter = new RateLimiter({
  namespace: 'rate_limit:ai',
  windowMs: 60_000,
  max: 20,
  failClosed: true, // billable; deny if Redis is down
});

/**
 * Code execution. Mirrors the original queue.js limit (10/min/user).
 * Exported so queue.js can keep its existing semantics through this module.
 */
export const executionLimiter = new RateLimiter({
  namespace: 'rate_limit:execution',
  windowMs: 60_000,
  max: 10,
  failClosed: true, // resource-intensive; deny if Redis is down
});

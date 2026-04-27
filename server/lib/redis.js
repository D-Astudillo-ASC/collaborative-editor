/**
 * Shared Redis connection used across queue, rate limiting, and any other
 * subsystems that need a coordinator. Centralizing this here means we open
 * exactly one connection per process instead of one per feature.
 *
 * Behavior matches the original `server/execution/queue.js` connection
 * (BullMQ-friendly options, exponential reconnect, READONLY-aware retry).
 */

import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redisConnection = new IORedis(REDIS_URL, {
  // BullMQ requires this so workers can block on commands indefinitely.
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    console.log(`[Redis] Retrying connection (attempt ${times}) in ${delay}ms...`);
    return delay;
  },
  reconnectOnError: (err) => {
    if (err.message.includes('READONLY')) return true;
    return false;
  },
  lazyConnect: false,
});

redisConnection.on('connect',     () => console.log('[Redis] connected'));
redisConnection.on('ready',       () => console.log('[Redis] ready'));
redisConnection.on('error',       (err) => console.error('[Redis] error:', err.message));
redisConnection.on('close',       () => console.warn('[Redis] connection closed'));
redisConnection.on('reconnecting', (delay) => console.log(`[Redis] reconnecting in ${delay}ms`));

export { redisConnection };

/**
 * Production-grade execution queue with BullMQ + Redis
 * 
 * Features:
 * - Distributed queue (works across multiple server instances)
 * - Rate limiting per user
 * - Job retries and failure handling
 * - Job priority support
 * - Real-time queue monitoring
 */

import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { executePython, executeJava } from './executor.js';

// Redis connection (supports Upstash, local Redis, or any Redis-compatible service)
// Configured for reliability with automatic reconnection
const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    console.log(`[Redis] Retrying connection (attempt ${times}) in ${delay}ms...`);
    return delay;
  },
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true; // Reconnect on READONLY error
    }
    return false;
  },
  lazyConnect: false, // Connect immediately
});

// Handle Redis connection events
redisConnection.on('connect', () => {
  console.log('[Redis] ✅ Connected to Redis');
});

redisConnection.on('ready', () => {
  console.log('[Redis] ✅ Redis connection ready');
});

redisConnection.on('error', (err) => {
  console.error('[Redis] ❌ Connection error:', err.message);
});

redisConnection.on('close', () => {
  console.warn('[Redis] ⚠️ Connection closed');
});

redisConnection.on('reconnecting', (delay) => {
  console.log(`[Redis] 🔄 Reconnecting in ${delay}ms...`);
});

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 10; // Max 10 executions per minute per user

// Queue configuration
const QUEUE_NAME = 'code-execution';
const MAX_CONCURRENT_JOBS = 2; // Process 2 executions at a time

/**
 * Rate limiter using Redis sliding window with atomic Lua script
 * Tracks executions per user in a time window
 * 
 * CRITICAL FIX: Uses Redis Lua script for atomic check-and-add to prevent race conditions
 * Previous implementation had a race condition where:
 * - Request A checks count (e.g., 9 < 10) → allowed
 * - Request B checks count (9 < 10) → allowed (BOTH see 9 before either adds)
 * - Request A adds entry (now 10)
 * - Request B adds entry (now 11) → BOTH allowed despite limit being 10
 * 
 * Lua script ensures: check count → if < limit → add entry → return result (all atomic)
 */
class RateLimiter {
  constructor(redis) {
    this.redis = redis;

    // Lua script for atomic rate limit check-and-add
    // Returns: [allowed (1 or 0), current_count, remaining, reset_at]
    // CRITICAL: Entire operation is atomic - no race conditions possible
    // 
    // How it works:
    // 1. Remove old entries outside the time window
    // 2. Count current entries in the window
    // 3. If count >= limit, return denied WITHOUT adding (prevents bypass)
    // 4. If count < limit, add entry atomically and return allowed
    // 
    // This ensures that even if 100 requests arrive simultaneously, only
    // maxRequests will be allowed - the Lua script executes atomically.
    this.checkLimitScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local windowStart = tonumber(ARGV[2])
      local maxRequests = tonumber(ARGV[3])
      local windowMs = tonumber(ARGV[4])
      local entryId = ARGV[5]  -- Unique ID passed from Node.js (now-random)
      
      -- Remove old entries outside the window
      redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)
      
      -- Count current entries in window
      local count = redis.call('ZCARD', key)
      
      -- Check if limit exceeded BEFORE adding (atomic check)
      if count >= maxRequests then
        -- Rate limit exceeded - return denied without adding
        -- CRITICAL: We don't add the entry here, preventing bypass
        local resetAt = now + windowMs
        redis.call('EXPIRE', key, math.ceil(windowMs / 1000))
        return {0, count, 0, resetAt}
      end
      
      -- Add new entry atomically (we know count < maxRequests)
      redis.call('ZADD', key, now, entryId)
      redis.call('EXPIRE', key, math.ceil(windowMs / 1000))
      
      -- Return allowed with updated count
      local newCount = count + 1
      local remaining = maxRequests - newCount
      local resetAt = now + windowMs
      return {1, newCount, remaining, resetAt}
    `;

    // Load script once and reuse (Redis caches scripts by SHA)
    this.scriptSha = null;
  }

  /**
   * Check if user has exceeded rate limit (atomic operation)
   * Uses Redis Lua script to ensure check-and-add is atomic
   * @param {string} userId - User ID from Clerk
   * @returns {Promise<{allowed: boolean, remaining: number, resetAt: number}>}
   */
  async checkLimit(userId) {
    const key = `rate_limit:execution:${userId}`;
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;
    // Generate unique entry ID (timestamp + random to avoid collisions)
    const entryId = `${now}-${Math.random().toString(36).substring(2, 15)}`;

    try {
      // Load script SHA if not already loaded (optimization: use EVALSHA after first load)
      if (!this.scriptSha) {
        // Load script and get SHA for future EVALSHA calls
        this.scriptSha = await this.redis.script('LOAD', this.checkLimitScript);
      }

      // Execute script atomically
      // Returns: [allowed (1 or 0), current_count, remaining, reset_at]
      const result = await this.redis.evalsha(
        this.scriptSha,
        1, // Number of keys
        key,
        now.toString(),
        windowStart.toString(),
        RATE_LIMIT_MAX_REQUESTS.toString(),
        RATE_LIMIT_WINDOW_MS.toString(),
        entryId // Unique entry identifier
      );

      // Parse result array from Lua script
      // Redis returns arrays as arrays in ioredis
      const allowed = result[0] === 1;
      const count = result[1];
      const remaining = result[2];
      const resetAt = result[3];

      return {
        allowed,
        remaining,
        resetAt,
      };
    } catch (error) {
      // If EVALSHA fails with NOSCRIPT, script was evicted - reload it
      if (error.message && error.message.includes('NOSCRIPT')) {
        this.scriptSha = null;
        // Retry with fresh script load
        return this.checkLimit(userId);
      }

      // CRITICAL FIX: Fail-closed for security (prevents unlimited executions during Redis outages)
      // During Redis outages, we should deny requests rather than allow unlimited executions
      // This prevents resource exhaustion and DoS attacks
      console.error('[RateLimiter] Error checking limit (failing closed for security):', error);
      return {
        allowed: false,
        remaining: 0,
        resetAt: now + RATE_LIMIT_WINDOW_MS,
        error: 'Rate limit service temporarily unavailable. Please try again later.',
      };
    }
  }

  /**
   * Get rate limit status for a user
   * Optimized with pipeline
   */
  async getStatus(userId) {
    const key = `rate_limit:execution:${userId}`;
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;

    // Use pipeline to batch commands
    const pipeline = this.redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zcard(key);
    pipeline.zrange(key, 0, 0, 'WITHSCORES');

    const results = await pipeline.exec();
    const count = results[1][1];
    const oldest = results[2][1];

    const resetAt = oldest.length > 0 ? parseInt(oldest[1]) + RATE_LIMIT_WINDOW_MS : now + RATE_LIMIT_WINDOW_MS;

    return {
      used: count,
      limit: RATE_LIMIT_MAX_REQUESTS,
      remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - count),
      resetAt,
    };
  }
}

// Initialize rate limiter
const rateLimiter = new RateLimiter(redisConnection);

/**
 * Execution queue with BullMQ
 * Uses lazy worker initialization to eliminate idle overhead when no jobs are running
 */
class ExecutionQueue {
  constructor() {
    // Verify Redis connection before creating queue
    if (!redisConnection.status || redisConnection.status !== 'ready') {
      console.warn('[ExecutionQueue] ⚠️ Redis not ready, queue may not work properly');
    }

    // Create BullMQ queue with separate connections for better reliability
    // BullMQ recommends separate connections for Queue, Worker, and QueueEvents
    this.queueConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      reconnectOnError: (err) => err.message.includes('READONLY'),
    });

    this.workerConnection = null; // Created lazily when first job arrives
    this.worker = null; // Created lazily - eliminates idle polling overhead
    this.workerInitialized = false;
    this.inactivityTimeout = null; // Timer to stop worker after inactivity
    this._shuttingDown = false; // Lock to prevent race conditions during shutdown
    this.WORKER_IDLE_TIMEOUT_MS = 30 * 1000; // Stop worker after 30 seconds of inactivity (optimized for low traffic)

    // Create BullMQ queue with optimized settings to reduce Redis commands
    // NOTE: Queue is lightweight - only creates Redis keys when jobs are added
    this.queue = new Queue(QUEUE_NAME, {
      connection: this.queueConnection,
      defaultJobOptions: {
        attempts: 1, // No retries (reduces Redis commands) - failures are immediate
        removeOnComplete: {
          age: 30, // CRITICAL FIX: Increased to 30s to prevent race condition with return value retrieval
          count: 1, // Keep only 1 completed job
        },
        removeOnFail: {
          age: 10, // Keep failed jobs for 10 seconds
          count: 1, // Keep only 1 failed job
        },
        // Disable unnecessary tracking to reduce Redis commands
        keepLogs: false, // Don't keep job logs (saves Redis commands)
      },
      // Reduce event stream size (fewer Redis commands for event tracking)
      streams: {
        events: {
          maxLen: 10, // Keep only last 10 events (minimal for debugging)
        },
      },
      // Reduce worker polling overhead
      settings: {
        stalledInterval: 60000, // Check stalled jobs every 60s (reduces idle polling by 50%)
        maxStalledCount: 1, // Reduce stalled job recovery attempts
      },
    });

    // Queue events for monitoring (optional - only if needed for other features)
    // NOTE: We use polling instead of waitUntilFinished() to reduce Redis commands
    // QueueEvents creates Redis Stream subscriptions which generate many commands
    // Only create if needed for other monitoring features
    this.queueEvents = null; // Disabled to reduce Redis overhead

    console.log('[ExecutionQueue] ✅ Queue initialized (worker will start lazily on first job)');
  }

  /**
   * Initialize worker lazily (only when first job arrives)
   * This eliminates idle polling overhead when no jobs are running
   * CRITICAL FIX: Prevents initialization during shutdown
   */
  async ensureWorkerInitialized() {
    if (this.workerInitialized) {
      return; // Worker already initialized
    }

    // Prevent initialization during shutdown (race condition fix)
    if (this._shuttingDown) {
      // Wait a bit and retry if shutdown completes
      await new Promise(resolve => setTimeout(resolve, 50));
      if (this._shuttingDown || this.workerInitialized) {
        return; // Still shutting down or already initialized
      }
    }

    console.log('[ExecutionQueue] 🚀 Initializing worker (lazy init - first job detected)');

    // Create worker connection only when needed
    this.workerConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      reconnectOnError: (err) => err.message.includes('READONLY'),
    });

    // Create worker to process jobs
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        console.log(`[ExecutionQueue] 🔄 Processing job ${job.id}...`);
        const { code, language, options } = job.data;

        try {
          // Get executor function based on language (can't serialize functions to Redis!)
          const executor = language === 'python' ? executePython : executeJava;

          if (!executor) {
            throw new Error(`No executor found for language: ${language}`);
          }

          console.log(`[ExecutionQueue] 🚀 Executing ${language} code for job ${job.id}`);

          // Execute the code
          const result = await executor(code, options);

          console.log(`[ExecutionQueue] ✅ Job ${job.id} execution completed:`, {
            status: result?.status,
            executionId: result?.executionId,
          });

          return result;
        } catch (error) {
          console.error(`[ExecutionQueue] ❌ Job ${job.id} execution error:`, error.message);
          console.error(`[ExecutionQueue] Error stack:`, error.stack);
          throw error; // Re-throw so BullMQ marks job as failed
        }
      },
      {
        connection: this.workerConnection,
        concurrency: MAX_CONCURRENT_JOBS,
        // Optimize worker settings to reduce Redis commands
        lockDuration: 30000, // Lock job for 30s (reduces re-processing attempts)
        maxStalledCount: 1, // Reduce stalled job checks
        stalledInterval: 60000, // Check for stalled jobs every 60s (reduces idle overhead by 50%)
        // Immediate cleanup to reduce Redis overhead
        removeOnComplete: {
          age: 30, // CRITICAL FIX: Increased to 30s to prevent race condition with return value retrieval
          count: 1,
        },
        removeOnFail: {
          age: 30, // Keep failed jobs for 30 seconds (for debugging)
          count: 1,
        },
      }
    );

    // Handle worker events
    this.worker.on('completed', (job, result) => {
      console.log(`[ExecutionQueue] ✅ Job ${job.id} completed:`, {
        executionId: result?.executionId,
        status: result?.status,
      });
      // Reset inactivity timer - worker is active
      this.resetInactivityTimer();
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[ExecutionQueue] ❌ Job ${job?.id} failed:`, err.message);
      console.error(`[ExecutionQueue] Error stack:`, err.stack);
      // Reset inactivity timer - worker is active
      this.resetInactivityTimer();
    });

    this.worker.on('error', (err) => {
      console.error(`[ExecutionQueue] ⚠️ Worker error:`, err.message);
      console.error(`[ExecutionQueue] Worker error stack:`, err.stack);
      // CRITICAL: Don't throw - worker errors should not crash the server
      // The error is logged, but the worker continues processing other jobs
    });

    this.worker.on('stalled', (jobId) => {
      console.warn(`[ExecutionQueue] ⚠️ Job ${jobId} stalled`);
    });

    this.worker.on('active', (job) => {
      // Reset inactivity timer when job starts processing
      this.resetInactivityTimer();
    });

    this.workerInitialized = true;
    this.resetInactivityTimer(); // Start inactivity timer
    console.log('[ExecutionQueue] ✅ Worker initialized and ready to process jobs');
  }

  /**
   * Reset inactivity timer - worker will stop after period of inactivity
   * This eliminates idle polling overhead when no jobs are running
   */
  resetInactivityTimer() {
    // Clear existing timer
    if (this.inactivityTimeout) {
      clearTimeout(this.inactivityTimeout);
    }

    // Set new timer to stop worker after inactivity
    this.inactivityTimeout = setTimeout(async () => {
      await this.stopWorkerAfterInactivity();
    }, this.WORKER_IDLE_TIMEOUT_MS);
  }

  /**
   * Stop worker after period of inactivity to save Redis commands
   * CRITICAL FIX: Prevents race condition where job arrives during shutdown
   * Improved: Check job counts BEFORE delay to reduce race condition window
   */
  async stopWorkerAfterInactivity() {
    if (!this.worker || !this.workerInitialized) {
      return; // Already stopped
    }

    // Prevent concurrent shutdown attempts (race condition fix)
    if (this._shuttingDown) {
      return; // Shutdown already in progress
    }
    this._shuttingDown = true;

    try {
      // CRITICAL FIX: Check job counts BEFORE delay to reduce race condition window
      // This prevents the scenario where:
      // 1. Timer fires → checks count (0) → starts shutdown
      // 2. New job arrives → ensureWorkerInitialized() called
      // 3. Worker starts initializing → shutdown completes → inconsistent state
      const [activeCount, waitingCount] = await Promise.all([
        this.queue.getActiveCount(),
        this.queue.getWaitingCount(),
      ]);

      // If jobs exist, don't shutdown - reset timer instead
      if (activeCount > 0 || waitingCount > 0) {
        this._shuttingDown = false;
        this.resetInactivityTimer();
        return;
      }

      // Small delay to catch in-flight jobs that may have just been enqueued
      await new Promise(resolve => setTimeout(resolve, 100));

      // Double-check job counts after delay (defense in depth)
      const [activeCount2, waitingCount2] = await Promise.all([
        this.queue.getActiveCount(),
        this.queue.getWaitingCount(),
      ]);

      // Only stop if truly idle (no active or waiting jobs)
      if (activeCount2 === 0 && waitingCount2 === 0) {
        console.log('[ExecutionQueue] 💤 Stopping worker after 30s inactivity (saving Redis commands)');

        try {
          await this.worker.close();
          if (this.workerConnection) {
            await this.workerConnection.quit();
          }
          this.worker = null;
          this.workerConnection = null;
          this.workerInitialized = false;

          if (this.inactivityTimeout) {
            clearTimeout(this.inactivityTimeout);
            this.inactivityTimeout = null;
          }

          console.log('[ExecutionQueue] ✅ Worker stopped - zero Redis overhead until next job');
        } catch (error) {
          console.error('[ExecutionQueue] ❌ Error stopping worker:', error.message);
        }
      } else {
        // Jobs still exist - reset timer
        this._shuttingDown = false;
        this.resetInactivityTimer();
      }
    } finally {
      this._shuttingDown = false;
    }
  }

  /**
   * Enqueue execution task with rate limiting
   * @param {Object} executionTask - Task to execute
   * @param {string} userId - User ID for rate limiting
   * @returns {Promise<Object>} Execution result
   */
  async enqueue(executionTask, userId) {
    // CRITICAL: Validate input size BEFORE enqueueing to prevent Redis DoS
    if (executionTask.code && executionTask.code.length > 100000) {
      throw new Error('Code size exceeds maximum limit (100KB)');
    }

    // Initialize worker lazily (only when first job arrives)
    // This eliminates idle polling overhead when no jobs are running
    await this.ensureWorkerInitialized();

    // Check rate limit
    const rateLimit = await rateLimiter.checkLimit(userId);

    if (!rateLimit.allowed) {
      const resetIn = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
      const errorMessage = rateLimit.error ||
        `Rate limit exceeded. You can execute code ${RATE_LIMIT_MAX_REQUESTS} times per minute. ` +
        `Please wait ${resetIn} seconds before trying again.`;
      throw new Error(errorMessage);
    }

    // Add job to queue with user ID for tracking
    // Optimized: Use auto-generated jobId (faster, fewer Redis commands)
    const job = await this.queue.add('execute-code', {
      ...executionTask,
      userId,
      enqueuedAt: Date.now(),
    }, {
      priority: 0, // Can be adjusted based on user tier
      // Don't specify jobId - let BullMQ auto-generate (more efficient)
      // jobId: `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      // Keep job briefly so we can get return value, then remove
      removeOnComplete: {
        age: 30, // CRITICAL FIX: Increased to 30s to prevent race condition with return value retrieval
        count: 1, // Keep only 1 completed job
      },
      removeOnFail: {
        age: 10, // Keep failed jobs for 10 seconds
        count: 1,
      },
    });

    // Reset inactivity timer - job was just enqueued
    if (this.workerInitialized) {
      this.resetInactivityTimer();
    }

    // Wait for job to complete using efficient polling (avoids QueueEvents overhead)
    // This is more efficient than waitUntilFinished() which uses Redis Streams
    console.log(`[ExecutionQueue] 📤 Enqueued job ${job.id} for user ${userId}`);

    try {
      const timeout = (executionTask.options?.timeout || 10000) + 10000; // Add 10s buffer
      const startTime = Date.now();
      const pollInterval = 200; // Poll every 200ms (balance between responsiveness and Redis commands)

      // Poll for job completion instead of using QueueEvents (much fewer Redis commands)
      // Use getState() which is a single Redis command instead of isCompleted() + isFailed()
      while (Date.now() - startTime < timeout) {
        // Check job state efficiently (single HGET command)
        const state = await job.getState();

        if (state === 'completed') {
          // Job completed - reload job to get return value
          // The job object needs to be refreshed from Redis to get returnvalue
          const completedJob = await this.queue.getJob(job.id);

          if (completedJob) {
            // Get return value - might need to wait a tiny bit for it to be written
            let returnValue = completedJob.returnvalue;

            // CRITICAL FIX: Add retry limit to prevent infinite polling
            // Race condition: Job cleanup can delete job before returnvalue is read
            let retryCount = 0;
            const MAX_RETRIES = 10; // Max 500ms of retries (10 * 50ms)

            while (returnValue === undefined && retryCount < MAX_RETRIES) {
              await new Promise(resolve => setTimeout(resolve, 50));
              const retryJob = await this.queue.getJob(job.id);
              if (!retryJob) {
                // Job was cleaned up before we could read return value
                throw new Error('Job was cleaned up before return value could be retrieved');
              }
              returnValue = retryJob.returnvalue;
              retryCount++;
            }

            if (returnValue !== undefined) {
              console.log(`[ExecutionQueue] ✅ Job ${job.id} finished successfully`);
              return returnValue;
            } else {
              // Job was cleaned up or return value never written
              throw new Error('Job completed but return value was not available');
            }
          }

          // Job doesn't exist (was cleaned up)
          throw new Error('Job was cleaned up before return value could be retrieved');
        }

        if (state === 'failed') {
          // Job failed - get failure reason
          const failedJob = await this.queue.getJob(job.id);
          const failedReason = failedJob?.failedReason || job.failedReason || 'Execution failed';
          console.error(`[ExecutionQueue] ❌ Job ${job.id} failed: ${failedReason}`);
          throw new Error(failedReason);
        }

        // Job still processing (waiting, active, delayed, etc.) - wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      // Timeout reached
      console.error(`[ExecutionQueue] ⏱️ Job ${job.id} timed out after ${timeout}ms`);
      throw new Error(`Execution timeout: Job took too long to process (${timeout}ms)`);
    } catch (error) {
      console.error(`[ExecutionQueue] ❌ Error waiting for job ${job.id}:`, error.message);

      // If it's not already a known error, check job state one more time
      if (!error.message.includes('Execution timeout') && !error.message.includes('Execution failed')) {
        try {
          const jobState = await job.getState();
          if (jobState === 'failed') {
            const failedReason = job.failedReason || error.message;
            throw new Error(failedReason || 'Execution failed');
          }
        } catch (stateError) {
          // Ignore state check errors
        }
      }

      throw error;
    }
  }

  /**
   * Get queue status
   */
  async getStatus() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      maxConcurrent: MAX_CONCURRENT_JOBS,
    };
  }

  /**
   * Get rate limit status for a user
   */
  async getRateLimitStatus(userId) {
    return rateLimiter.getStatus(userId);
  }

  /**
   * Close connections (for graceful shutdown)
   * CRITICAL FIX: Clears inactivity timer to prevent memory leaks
   */
  async close() {
    // CRITICAL: Clear inactivity timer FIRST to prevent memory leaks
    if (this.inactivityTimeout) {
      clearTimeout(this.inactivityTimeout);
      this.inactivityTimeout = null;
    }

    // Set shutdown flag to prevent race conditions
    this._shuttingDown = true;

    try {
      if (this.worker) {
        await this.worker.close();
      }
      if (this.queueEvents) {
        await this.queueEvents.close();
      }
      await this.queue.close();
      // Close all Redis connections
      await redisConnection.quit();
      await this.queue.client.quit();
      if (this.workerConnection) {
        await this.workerConnection.quit();
      }
      if (this.queueEvents) {
        await this.queueEvents.connection.quit();
      }
    } finally {
      this._shuttingDown = false;
    }
  }
}

// Singleton instance
export const executionQueue = new ExecutionQueue();

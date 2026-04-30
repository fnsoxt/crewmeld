import { createLogger } from '@crewmeld/logger'
import { type ConnectionOptions, Queue, Worker } from 'bullmq'
import type { NotificationJobPayload, TimeoutJobPayload } from '@/types/sop'

const logger = createLogger('SopQueue')

let cachedConnection: ConnectionOptions | null = null

/**
 * Parse REDIS_URL env var into BullMQ ConnectionOptions
 *
 * Unlike `getRedisClient()` (returns null when Redis unavailable),
 * BullMQ requires Redis. Returns null when no REDIS_URL,
 * queue factory returning null means SOP features unavailable.
 */
function getConnection(): ConnectionOptions | null {
  if (typeof window !== 'undefined') return null
  if (cachedConnection) return cachedConnection

  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    logger.warn('REDIS_URL not configured, SOP queues unavailable')
    return null
  }

  try {
    const url = new URL(redisUrl)
    cachedConnection = {
      host: url.hostname,
      port: Number(url.port) || 6379,
      password: url.password || undefined,
      db: Number(url.pathname.slice(1)) || 0,
    }
    return cachedConnection
  } catch (error) {
    logger.error('Failed to parse REDIS_URL', { error: (error as Error).message })
    return null
  }
}

let sopTimeoutQueue: Queue | null = null
let sopNotificationQueue: Queue | null = null

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
}

/**
 * Get SOP timeout queue (lazy initialization)
 *
 * @returns Queue instance, null when Redis unavailable
 */
export function getSopTimeoutQueue(): Queue | null {
  if (sopTimeoutQueue) return sopTimeoutQueue
  const conn = getConnection()
  if (!conn) return null

  sopTimeoutQueue = new Queue('sop-timeout', {
    connection: conn,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  })
  return sopTimeoutQueue
}

/**
 * Get SOP notification queue (lazy initialization)
 *
 * @returns Queue instance, null when Redis unavailable
 */
export function getSopNotificationQueue(): Queue | null {
  if (sopNotificationQueue) return sopNotificationQueue
  const conn = getConnection()
  if (!conn) return null

  sopNotificationQueue = new Queue('sop-notification', {
    connection: conn,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  })
  return sopNotificationQueue
}

/**
 * Initialize SOP Workers — called on process startup
 *
 * SSR guard: do not initialize in browser environment.
 * Skip when no Redis (SOP features degraded).
 */
export function initSopWorkers(): void {
  if (typeof window !== 'undefined') return

  const conn = getConnection()
  if (!conn) {
    logger.warn('Skipping SOP workers initialization (no Redis)')
    return
  }

  new Worker(
    'sop-timeout',
    async (job) => {
      const mod = await import('@/lib/sop/workers/timeout-worker')
      await mod.processTimeout(job.data as TimeoutJobPayload)
    },
    {
      connection: conn,
      concurrency: 5,
    }
  )

  new Worker(
    'sop-notification',
    async (job) => {
      const mod = await import('@/lib/sop/workers/notification-worker')
      await mod.processNotification(job.data as NotificationJobPayload)
    },
    {
      connection: conn,
      concurrency: 5,
    }
  )

  logger.info('SOP workers initialized')
}

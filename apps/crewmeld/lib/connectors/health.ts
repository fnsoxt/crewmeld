import { db } from '@crewmeld/db'
import { systemConnections } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq, ne } from 'drizzle-orm'
import { getRedisClient } from '@/lib/core/config/redis'
import { decryptConfig } from './encryption'
import { testConnection } from './tester'
import type { ConnectionConfig, ConnectionType } from './types'

const logger = createLogger('HealthCheckScheduler')

const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000

let schedulerTimer: ReturnType<typeof setInterval> | null = null

interface HealthCheckCycleResult {
  total: number
  success: number
  failed: number
  skipped: number
  redisHealthy: boolean | null
}

/**
 * Run one health check cycle: iterate all non-disconnected connections, test + update DB
 */
export async function runHealthCheckCycle(): Promise<HealthCheckCycleResult> {
  const stats: HealthCheckCycleResult = {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    redisHealthy: null,
  }

  const connections = await db
    .select()
    .from(systemConnections)
    .where(ne(systemConnections.status, 'disconnected'))

  stats.total = connections.length
  logger.info(`Starting health check, ${stats.total} connections total`)

  for (const conn of connections) {
    let config: ConnectionConfig
    try {
      config = JSON.parse(decryptConfig(conn.configEncrypted))
    } catch {
      logger.warn(`Failed to decrypt connection config (skipped): ${conn.id}`)
      stats.skipped++
      continue
    }

    try {
      const result = await testConnection(conn.type as ConnectionType, config)

      await db
        .update(systemConnections)
        .set({
          status: result.success ? 'connected' : 'error',
          lastHealthCheck: new Date(),
          lastHealthMessageI18n: { key: result.messageKey, params: result.messageParams },
          updatedAt: new Date(),
        })
        .where(eq(systemConnections.id, conn.id))

      if (result.success) {
        stats.success++
      } else {
        stats.failed++
        logger.warn(`Health check failed: ${conn.name} (${conn.id}) — ${result.messageKey}`, {
          params: result.messageParams,
        })
      }
    } catch (error) {
      stats.failed++
      const errorText = error instanceof Error ? error.message : ''
      logger.error(`Health check error: ${conn.name} (${conn.id})`, error)

      await db
        .update(systemConnections)
        .set({
          status: 'error',
          lastHealthCheck: new Date(),
          lastHealthMessageI18n: {
            key: 'connTestFailed',
            params: { name: conn.name, error: errorText },
          },
          updatedAt: new Date(),
        })
        .where(eq(systemConnections.id, conn.id))
    }
  }

  stats.redisHealthy = await checkRedisHealth()

  logger.info(
    `Health check completed: success=${stats.success}, failed=${stats.failed}, skipped=${stats.skipped}, Redis=${stats.redisHealthy}`
  )

  return stats
}

/**
 * Check Redis connection health status
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const redis = getRedisClient()
    if (!redis) {
      return false
    }
    const pong = await redis.ping()
    return pong === 'PONG'
  } catch (error) {
    logger.warn('Redis health check failed', error)
    return false
  }
}

/**
 * Start scheduled health check scheduler
 */
export function startHealthCheckScheduler(): void {
  if (schedulerTimer) {
    logger.warn('Health check scheduler already running')
    return
  }

  logger.info(`Starting health check scheduler, interval ${HEALTH_CHECK_INTERVAL_MS / 1000}s`)
  schedulerTimer = setInterval(() => {
    runHealthCheckCycle().catch((error) => {
      logger.error('Health check scheduling error', error)
    })
  }, HEALTH_CHECK_INTERVAL_MS)
}

/**
 * Stop health check scheduler
 */
export function stopHealthCheckScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer)
    schedulerTimer = null
    logger.info('Health check scheduler stopped')
  }
}

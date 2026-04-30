import { createLogger } from '@crewmeld/logger'
import { t } from '@/lib/core/server-i18n'
import type { HealthCheckResult, ServiceHealth } from '@/app/(employee)/settings/types'

const logger = createLogger('HealthCheck')

const TIMEOUT_MS = 5000

/** Generic health check wrapper: timing + error handling */
async function checkServiceHealth(
  name: string,
  checker: () => Promise<{ version: string | null; message: string | null }>,
  lang: 'zh' | 'en' = 'zh'
): Promise<ServiceHealth> {
  const start = Date.now()
  try {
    const { version, message } = await checker()
    const latencyMs = Date.now() - start
    return { name, status: 'healthy', version, latencyMs, message }
  } catch (err) {
    const latencyMs = Date.now() - start
    const isTimeout = latencyMs >= TIMEOUT_MS - 100

    if (err instanceof Error && 'notConfigured' in err) {
      return {
        name,
        status: 'not_configured',
        version: null,
        latencyMs: null,
        message: err.message,
      }
    }

    return {
      name,
      status: isTimeout ? 'timeout' : 'unhealthy',
      version: null,
      latencyMs,
      message: err instanceof Error ? err.message : t('healthCheckFailed', lang),
    }
  }
}

/** Check PostgreSQL */
async function checkPostgres(): Promise<{ version: string | null; message: string | null }> {
  const { db } = await import('@crewmeld/db')
  const { sql } = await import('drizzle-orm')

  const result = await db.execute(sql`SELECT version()`)
  const rows = result as unknown as { rows?: Array<{ version?: string }> }
  const version = rows.rows?.[0]?.version ?? null
  return { version, message: null }
}

/** Check Redis */
async function checkRedis(): Promise<{ version: string | null; message: string | null }> {
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    throw Object.assign(new Error('REDIS_URL'), { notConfigured: true })
  }

  const { default: Redis } = await import('ioredis')
  const redis = new Redis(redisUrl, { connectTimeout: TIMEOUT_MS, lazyConnect: true })
  try {
    await redis.connect()
    const info = await redis.info('server')
    const versionMatch = info.match(/redis_version:(.+)/)
    const version = versionMatch ? versionMatch[1].trim() : null
    await redis.quit()
    return { version, message: null }
  } catch (err) {
    try {
      await redis.quit()
    } catch {
      /* ignore */
    }
    throw err
  }
}

/** Check Ollama */
async function checkOllama(): Promise<{ version: string | null; message: string | null }> {
  const ollamaHost = process.env.OLLAMA_HOST
  if (!ollamaHost) {
    throw Object.assign(new Error('OLLAMA_HOST'), { notConfigured: true })
  }

  const response = await fetch(`${ollamaHost}/api/tags`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return { version: null, message: null }
}

/** Run all health checks */
export async function runHealthChecks(lang: 'zh' | 'en' = 'zh'): Promise<HealthCheckResult> {
  const services: ServiceHealth[] = []

  services.push(await checkServiceHealth('PostgreSQL', checkPostgres, lang))
  services.push(await checkServiceHealth('Redis', checkRedis, lang))
  services.push(await checkServiceHealth('Ollama', checkOllama, lang))

  logger.info(`Health check completed: ${services.map((s) => `${s.name}=${s.status}`).join(', ')}`)

  return {
    services,
    checkedAt: new Date().toISOString(),
  }
}

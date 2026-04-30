import { db } from '@crewmeld/db'
import { createLogger } from '@crewmeld/logger'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const logger = createLogger('ReadyCheck')

interface ComponentStatus {
  status: 'ok' | 'error' | 'skipped'
  latencyMs: number
  error?: string
}

interface ReadyResult {
  status: 'ready' | 'not_ready'
  version: string
  components: Record<string, ComponentStatus>
  timestamp: string
}

async function measureCheck(name: string, fn: () => Promise<void>): Promise<ComponentStatus> {
  const start = performance.now()
  try {
    await fn()
    return { status: 'ok', latencyMs: Math.round(performance.now() - start) }
  } catch (error) {
    const msg = `${name} check failed: ${error instanceof Error ? error.message : 'unknown'}`
    logger.error(`${name} check failed: ${error instanceof Error ? error.message : 'unknown'}`)
    return {
      status: 'error',
      latencyMs: Math.round(performance.now() - start),
      error: msg,
    }
  }
}

export async function GET() {
  const components: Record<string, ComponentStatus> = {}

  const dbStatus = await measureCheck('Database', async () => {
    await db.execute(sql`SELECT 1`)
  })
  components.database = dbStatus

  if (process.env.REDIS_URL) {
    const redisStatus = await measureCheck('Redis', async () => {
      const url = new URL(process.env.REDIS_URL!)
      const host = url.hostname || '127.0.0.1'
      const port = Number.parseInt(url.port || '6379', 10)
      const { Socket } = await import('node:net')

      await new Promise<void>((resolve, reject) => {
        const socket = new Socket()
        socket.setTimeout(3000)
        socket.once('connect', () => {
          socket.destroy()
          resolve()
        })
        socket.once('timeout', () => {
          socket.destroy()
          reject(new Error('Connection timeout'))
        })
        socket.once('error', (err) => {
          socket.destroy()
          reject(err)
        })
        socket.connect(port, host)
      })
    })
    components.redis = redisStatus
  } else {
    components.redis = { status: 'skipped', latencyMs: 0 }
  }

  // P0: tolerate missing `__drizzle_migrations` ledger. Fresh installs
  // bootstrapped via init.sql do not populate the drizzle-kit migration
  // ledger, so treat a missing table as a valid state. Only flag actual DB
  // connectivity/permission errors as not-ready.
  const migrationsStatus = await measureCheck('Migrations', async () => {
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = '__drizzle_migrations'
      ) AS present
    `)
    const rows = (result as unknown as { rows?: Array<{ present: boolean }> }).rows
    const present = Array.isArray(rows) && rows.length > 0 ? rows[0]?.present === true : false
    if (present) {
      await db.execute(sql`SELECT COUNT(*) FROM __drizzle_migrations`)
    }
  })
  components.migrations = migrationsStatus

  const hasErrors = Object.values(components).some((c) => c.status === 'error')
  const result: ReadyResult = {
    status: hasErrors ? 'not_ready' : 'ready',
    version: process.env.VERSION || 'dev',
    components,
    timestamp: new Date().toISOString(),
  }

  return NextResponse.json(result, { status: hasErrors ? 503 : 200 })
}

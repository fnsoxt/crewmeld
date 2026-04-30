import { db } from '@crewmeld/db'
import { systemConnections } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { decryptConfig } from '@/lib/connectors/encryption'
import { testConnection } from '@/lib/connectors/tester'
import type { ConnectionConfig, ConnectionType } from '@/lib/connectors/types'

const logger = createLogger('ConnectorIdTestAPI')

async function _POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('connector:test')
    if (auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params

    // Parse config override from frontend request body (optional)
    let overrideConfig: Record<string, unknown> | null = null
    try {
      const body = await request.json()
      if (body.config && typeof body.config === 'object' && !Array.isArray(body.config)) {
        overrideConfig = body.config as Record<string, unknown>
      }
    } catch {
      // Empty or invalid JSON body is fine, use database config
    }

    const [conn] = await db
      .select()
      .from(systemConnections)
      .where(eq(systemConnections.id, id))
      .limit(1)

    if (!conn) {
      return apiErr('api.connector.notFound', { status: 404 })
    }

    let config: ConnectionConfig
    try {
      config = JSON.parse(decryptConfig(conn.configEncrypted))
    } catch {
      return apiErr('api.connector.decryptFailed', { status: 500 })
    }

    // Merge frontend config onto database config
    // Skip masked values (containing ****) and empty strings, keep real values from database
    if (overrideConfig) {
      for (const [key, value] of Object.entries(overrideConfig)) {
        if (typeof value === 'string' && value.includes('****')) continue
        if (typeof value === 'string' && value === '') continue
        ;(config as Record<string, unknown>)[key] = value
      }
    }

    const result = await testConnection(conn.type as ConnectionType, config)

    await db
      .update(systemConnections)
      .set({
        status: result.success ? 'connected' : 'error',
        lastHealthCheck: new Date(),
        lastHealthMessageI18n: { key: result.messageKey, params: result.messageParams },
        updatedAt: new Date(),
      })
      .where(eq(systemConnections.id, id))

    logger.info(`Connection test: ${conn.name} (${id}), success=${result.success}`)

    return apiOk(result)
  } catch (error) {
    logger.error('Connection test failed', error)
    return apiErr('api.connector.testFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)

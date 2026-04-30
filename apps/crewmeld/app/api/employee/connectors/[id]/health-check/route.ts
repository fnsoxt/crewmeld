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

const logger = createLogger('ConnectorHealthCheckAPI')

async function _POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('connector:test')
    if (auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params

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

    logger.info(`[HealthCheck] Start check: ${conn.name} (${id}), type=${conn.type}`)

    const result = await testConnection(conn.type as ConnectionType, config)

    logger.info(`[HealthCheck] External request result`, {
      connectionId: id,
      connectionName: conn.name,
      type: conn.type,
      success: result.success,
      messageKey: result.messageKey,
      messageParams: result.messageParams,
      latencyMs: result.latencyMs,
      details: result.details,
    })

    await db
      .update(systemConnections)
      .set({
        status: result.success ? 'connected' : 'error',
        lastHealthCheck: new Date(),
        lastHealthMessageI18n: { key: result.messageKey, params: result.messageParams },
        updatedAt: new Date(),
      })
      .where(eq(systemConnections.id, id))

    logger.info(`[HealthCheck] Done: ${conn.name} (${id}), success=${result.success}`)

    return apiOk(result)
  } catch (error) {
    logger.error('Health check failed', error)
    return apiErr('api.connector.healthCheckFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)

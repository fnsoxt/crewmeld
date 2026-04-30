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

const logger = createLogger('ChannelTestAPI')

/**
 * POST /api/employee/channels/[id]/test — Test channel connection
 */
async function _POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('channel:edit')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params
    const [row] = await db
      .select()
      .from(systemConnections)
      .where(eq(systemConnections.id, id))
      .limit(1)

    if (!row) {
      return apiErr('api.channel.notFound', { status: 404 })
    }

    let config: ConnectionConfig
    try {
      config = JSON.parse(decryptConfig(row.configEncrypted))
    } catch {
      return apiErr('api.channel.decryptFailed', { status: 500 })
    }

    // Mark as testing
    await db
      .update(systemConnections)
      .set({
        status: 'testing',
        updatedAt: new Date(),
      })
      .where(eq(systemConnections.id, id))

    const result = await testConnection(row.type as ConnectionType, config)

    // Update status
    await db
      .update(systemConnections)
      .set({
        status: result.success ? 'connected' : 'error',
        lastHealthCheck: new Date(),
        lastHealthMessageI18n: { key: result.messageKey, params: result.messageParams },
        updatedAt: new Date(),
      })
      .where(eq(systemConnections.id, id))

    return apiOk(result)
  } catch (error) {
    logger.error('Channel test failed', error)
    return apiErr('api.channel.testFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)

import { CONNECTION_TYPES } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { testConnection } from '@/lib/connectors/tester'
import type { ConnectionConfig, ConnectionType } from '@/lib/connectors/types'

const logger = createLogger('ConnectorTestAPI')

async function _POST(request: NextRequest) {
  try {
    const auth = await requirePermission('connector:test')
    if (auth.error) {
      return apiAuthErr(auth)
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return apiErr('api.common.invalidBody', { status: 400 })
    }

    const { type, config } = body

    if (
      !type ||
      typeof type !== 'string' ||
      !CONNECTION_TYPES.includes(type as (typeof CONNECTION_TYPES)[number])
    ) {
      return apiErr('api.connector.typeInvalid', { status: 400 })
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return apiErr('api.connector.configEmpty', { status: 400 })
    }

    const result = await testConnection(type as ConnectionType, config as ConnectionConfig)

    logger.info(`Connection test (no ID): type=${type}, success=${result.success}`)

    return apiOk(result)
  } catch (error) {
    logger.error('Connection test failed', error)
    return apiErr('api.connector.testFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)

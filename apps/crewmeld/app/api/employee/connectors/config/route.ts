import { db, systemConnections } from '@crewmeld/db'
import { inArray } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { decryptConfig } from '@/lib/connectors/encryption'

/**
 * GET /api/employee/connectors/config?ids=id1,id2
 * Get full (unmasked) config for specified connections — for internal tool generator use only
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission('connector:list')
  if (!auth.authenticated || auth.error) {
    return apiAuthErr(auth)
  }

  const idsParam = new URL(request.url).searchParams.get('ids')
  if (!idsParam) {
    return apiErr('api.connector.missingIds', { status: 400 })
  }

  const ids = idsParam.split(',').filter(Boolean)
  if (ids.length === 0) {
    return apiOk(null, { extra: { configs: [] } })
  }

  const rows = await db
    .select({
      id: systemConnections.id,
      name: systemConnections.name,
      type: systemConnections.type,
      configEncrypted: systemConnections.configEncrypted,
    })
    .from(systemConnections)
    .where(inArray(systemConnections.id, ids))

  const configs = rows.map((row) => {
    let config: Record<string, unknown> = {}
    try {
      config = JSON.parse(decryptConfig(row.configEncrypted))
    } catch {
      /* ignore */
    }
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      config,
    }
  })

  return apiOk(configs, { extra: { configs } })
}

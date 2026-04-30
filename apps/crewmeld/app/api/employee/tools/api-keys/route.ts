import { db } from '@crewmeld/db'
import { toolApiKeys } from '@crewmeld/db/schema'
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { decryptConfig, encryptConfig } from '@/lib/connectors/encryption'

const GLOBAL_ID = 'global'

/**
 * GET /api/employee/tools/api-keys
 * Get tool API Key list (values masked)
 */
export async function GET() {
  const auth = await requirePermission('skill:edit')
  if (!auth.authenticated || auth.error) {
    return apiAuthErr(auth)
  }

  const [row] = await db.select().from(toolApiKeys).where(eq(toolApiKeys.id, GLOBAL_ID)).limit(1)

  if (!row) {
    return apiOk(null, { extra: { keys: [] } })
  }

  try {
    const keys = JSON.parse(decryptConfig(row.keysEncrypted)) as Array<{
      name: string
      value: string
    }>
    return apiOk(null, { extra: { keys } })
  } catch {
    return apiOk(null, { extra: { keys: [] } })
  }
}

/**
 * POST /api/employee/tools/api-keys
 * Save tool API Key list (encrypted storage)
 */
async function _POST(request: NextRequest) {
  const auth = await requirePermission('skill:edit')
  if (!auth.authenticated || auth.error) {
    return apiAuthErr(auth)
  }

  const body = await request.json()
  const { keys } = body as { keys: Array<{ name: string; value: string }> }

  if (!Array.isArray(keys)) {
    return apiErr('api.tool.paramsInvalid', { status: 400 })
  }

  const valid = keys.filter((k) => k.name?.trim() && k.value?.trim())
  const encrypted = encryptConfig(JSON.stringify(valid))
  const now = new Date()

  const [existing] = await db
    .select({ id: toolApiKeys.id })
    .from(toolApiKeys)
    .where(eq(toolApiKeys.id, GLOBAL_ID))
    .limit(1)

  if (existing) {
    await db
      .update(toolApiKeys)
      .set({
        keysEncrypted: encrypted,
        updatedAt: now,
      })
      .where(eq(toolApiKeys.id, GLOBAL_ID))
  } else {
    await db.insert(toolApiKeys).values({
      id: GLOBAL_ID,
      keysEncrypted: encrypted,
      updatedAt: now,
    })
  }

  return apiOk(null)
}

export const POST = withAudit(_POST)

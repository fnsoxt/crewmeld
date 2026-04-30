import { db } from '@crewmeld/db'
import { modelConfigs } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { getSession } from '@/lib/auth'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { encryptConfig } from '@/lib/connectors/encryption'
import type { ModelDefaultParams } from '@/lib/models/types'

const logger = createLogger('ModelsAPI')
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return apiErr('api.common.unauthorized', { status: 401 })
    }

    const { id } = await params
    const [row] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, id))
    if (!row) {
      return apiErr('api.model.notFound', { status: 404 })
    }

    return apiOk({
      id: row.id,
      displayName: row.displayName,
      providerId: row.providerId,
      modelName: row.modelName,
      isActive: row.isActive,
    })
  } catch (error) {
    logger.error('Failed to fetch model config', error)
    return apiErr('api.model.fetchListFailed', { status: 500 })
  }
}

async function _PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('model:list')
    if (auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params
    const [existing] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, id))
    if (!existing) {
      return apiErr('api.model.notFound', { status: 404 })
    }

    const body = await request.json()
    const { displayName, modelName, apiKey, apiEndpoint, defaultParams, isActive } = body

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (displayName !== undefined) {
      updates.displayName = displayName
    }

    if (modelName !== undefined) {
      updates.modelName = modelName || null
    }

    if (apiKey !== undefined) {
      updates.apiKeyEncrypted = apiKey ? encryptConfig(apiKey) : null
    }

    if (apiEndpoint !== undefined) {
      updates.apiEndpoint = apiEndpoint
    }

    if (defaultParams !== undefined) {
      const existingParams = existing.defaultParams as ModelDefaultParams
      updates.defaultParams = { ...existingParams, ...defaultParams }
    }

    if (isActive !== undefined) {
      updates.isActive = isActive
    }

    await db.update(modelConfigs).set(updates).where(eq(modelConfigs.id, id))

    logger.info('Model config updated', { id })

    return apiOk({
      id,
      displayName: (updates.displayName as string) ?? existing.displayName,
      isActive: (updates.isActive as boolean) ?? existing.isActive,
      updatedAt: (updates.updatedAt as Date).toISOString(),
    })
  } catch (error) {
    logger.error('Failed to update model config', error)
    return apiErr('api.model.updateFailed', { status: 500 })
  }
}

async function _DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('model:delete')
    if (auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params
    const [existing] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, id))
    if (!existing) {
      return apiErr('api.model.notFound', { status: 404 })
    }

    await db.delete(modelConfigs).where(eq(modelConfigs.id, id))

    logger.info('Model config deleted', { id })

    return apiOk(null, { message: 'api.model.deleted' })
  } catch (error) {
    logger.error('Failed to delete model config', error)
    return apiErr('api.model.deleteFailed', { status: 500 })
  }
}

export const PATCH = withAudit(_PATCH)
export const DELETE = withAudit(_DELETE)

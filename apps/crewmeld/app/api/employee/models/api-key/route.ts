import { db } from '@crewmeld/db'
import { modelConfigs } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiErr, apiOk } from '@/lib/api/response'
import { getSession } from '@/lib/auth'
import { decryptConfig } from '@/lib/connectors/encryption'

export const dynamic = 'force-dynamic'

const logger = createLogger('ModelsApiKeyAPI')

/**
 * GET /api/employee/models/api-key?modelName=xxx
 * Find active model config by modelName and return the decrypted API Key.
 * For internal canvas editor use only; requires login session.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return apiErr('api.common.unauthorized', { status: 401 })
    }

    const modelName = request.nextUrl.searchParams.get('modelName')
    if (!modelName) {
      return apiErr('api.model.modelNameParamMissing', { status: 400 })
    }

    // Find matching active model configuration
    const rows = await db
      .select({
        apiKeyEncrypted: modelConfigs.apiKeyEncrypted,
        providerId: modelConfigs.providerId,
      })
      .from(modelConfigs)
      .where(and(eq(modelConfigs.modelName, modelName), eq(modelConfigs.isActive, true)))
      .limit(1)

    if (rows.length === 0 || !rows[0].apiKeyEncrypted) {
      return apiOk({ apiKey: null })
    }

    const apiKey = decryptConfig(rows[0].apiKeyEncrypted)

    return apiOk({ apiKey })
  } catch (error) {
    logger.error('Failed to fetch model API key', error)
    return apiErr('api.model.apiKeyFetchFailed', { status: 500 })
  }
}

import { createLogger } from '@crewmeld/logger'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { healthCheck, loadRagflowConfig, RagflowClientError } from '@/lib/ragflow'

const logger = createLogger('RagflowHealthAPI')

/**
 * GET /api/employee/ragflow/health — Health check
 */
export async function GET() {
  try {
    const auth = await requirePermission('knowledge:list')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const config = await loadRagflowConfig()
    const result = await healthCheck(config)

    return apiOk(
      result.ok ? { ok: true } : { ok: false, errorType: result.errorType, detail: result.detail }
    )
  } catch (error) {
    if (error instanceof RagflowClientError) {
      return apiErr('api.ragflow.upstreamError', { status: 502, extra: { detail: error.message } })
    }
    logger.error('Health check failed', error)
    return apiErr('api.ragflow.healthCheckFailed', { status: 500 })
  }
}

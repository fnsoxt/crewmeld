import { createLogger } from '@crewmeld/logger'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { cancelSopExecution } from '@/lib/sop/engine'

const logger = createLogger('API:Sops:Cancel')

async function _POST(
  request: NextRequest,
  { params: _params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission('sop:edit')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const body = (await request.json()) as { executionId?: string }

    if (!body.executionId) {
      return apiErr('api.sop.missingExecutionId', { status: 400 })
    }

    const cancelled = await cancelSopExecution(body.executionId)

    if (!cancelled) {
      return apiErr('api.sop.cancelRejected', { status: 409 })
    }

    logger.info('SOP execution cancelled', { executionId: body.executionId })

    return apiOk(null)
  } catch (error) {
    logger.error('Failed to cancel SOP execution', error)
    return apiErr('api.sop.cancelFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)

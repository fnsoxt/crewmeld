import { db } from '@crewmeld/db'
import { sopPauseStates } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { getSession } from '@/lib/auth'
import { verifyApprovalToken } from '@/lib/human-employees/approval-token'
import { resumeSopFromPause } from '@/lib/sop/engine'
import { getSopTimeoutQueue } from '@/lib/sop/queue'

const logger = createLogger('API:Sops:Decide')

/**
 * POST /api/employee/sops/pause/[pauseId]/decide — Approval decision (First-Wins)
 *
 * Dual-path authentication:
 * 1. ?token= query param -> verifyApprovalToken, no session required
 * 2. No token -> existing session authentication
 */
async function _POST(request: NextRequest, { params }: { params: Promise<{ pauseId: string }> }) {
  try {
    const { pauseId } = await params
    const url = new URL(request.url)
    const token = url.searchParams.get('token')

    let decidedBy: string

    if (token) {
      const verified = await verifyApprovalToken(token)
      if (!verified.valid) {
        return apiErr('api.sop.approvalInvalidToken', { status: 401 })
      }
      if (verified.pauseId !== pauseId) {
        return apiErr('api.sop.approvalTokenMismatch', { status: 400 })
      }
      decidedBy = 'token-auth'
    } else {
      const session = await getSession()
      if (!session?.user?.id) {
        return apiErr('api.common.unauthorized', { status: 401 })
      }
      decidedBy = session.user.id
    }

    const body = (await request.json()) as { decision?: string; comment?: string }

    if (!body.decision || !['approved', 'rejected'].includes(body.decision)) {
      return apiErr('api.sop.decideInvalidValue', { status: 400 })
    }

    const result = await db
      .update(sopPauseStates)
      .set({
        status: 'decided',
        decision: body.decision as 'approved' | 'rejected',
        decidedBy,
        comment: body.comment ?? null,
        decidedAt: new Date(),
      })
      .where(and(eq(sopPauseStates.id, pauseId), eq(sopPauseStates.status, 'waiting')))
      .returning()

    if (result.length === 0) {
      return apiErr('api.sop.approvalAlreadyHandled', { status: 409 })
    }

    const pauseState = result[0]

    if (pauseState.timeoutJobId) {
      const timeoutQueue = getSopTimeoutQueue()
      if (timeoutQueue) {
        try {
          const job = await timeoutQueue.getJob(pauseState.timeoutJobId)
          if (job) await job.remove()
        } catch {
          logger.warn('Failed to cancel timeout job', { jobId: pauseState.timeoutJobId })
        }
      }
    }

    void resumeSopFromPause({
      executionId: pauseState.executionId,
      nodeId: pauseState.nodeId,
      decision: body.decision,
      decidedBy,
      comment: body.comment,
    })

    logger.info('SOP approval decision completed', {
      pauseId,
      decision: body.decision,
      decidedBy,
      authMethod: token ? 'token' : 'session',
    })

    return apiOk({ pauseId, decision: body.decision })
  } catch (error) {
    logger.error('Approval decision failed', error)
    return apiErr('api.sop.decideFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)

import { db } from '@crewmeld/db'
import { sopPauseStates } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { resumeSopFromPause } from '@/lib/sop/engine'

const logger = createLogger('SopApproveAPI')

async function _POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('task:create')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { id: pauseId } = await params
    const decidedBy = auth.userId!

    let comment = ''
    try {
      const body = await request.json()
      comment = typeof body.comment === 'string' ? body.comment.slice(0, 500) : ''
    } catch {
      // Body is optional
    }

    const now = new Date()

    // First-Wins: only the first UPDATE where status='waiting' succeeds
    const updated = await db
      .update(sopPauseStates)
      .set({
        status: 'decided',
        decision: 'approved',
        decidedBy,
        comment: comment || null,
        decidedAt: now,
      })
      .where(and(eq(sopPauseStates.id, pauseId), eq(sopPauseStates.status, 'waiting')))
      .returning({ id: sopPauseStates.id })

    if (updated.length === 0) {
      return apiErr('api.task.approvalNotFoundOrProcessed', { status: 409 })
    }

    logger.info(`SOP pause ${pauseId} approved by ${decidedBy}`)

    // Get executionId and nodeId associated with pause, trigger SOP resume
    const pauseRows = await db
      .select({
        executionId: sopPauseStates.executionId,
        nodeId: sopPauseStates.nodeId,
      })
      .from(sopPauseStates)
      .where(eq(sopPauseStates.id, pauseId))

    const pause = pauseRows[0]
    if (pause) {
      void resumeSopFromPause({
        executionId: pause.executionId,
        nodeId: pause.nodeId,
        decision: 'approved',
        decidedBy,
        comment,
      })
    }

    return apiOk({
      pauseId,
      decision: 'approved',
      decidedBy,
      decidedAt: now.toISOString(),
    })
  } catch (error) {
    logger.error('Approval operation failed', error)
    return apiErr('api.task.approveFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)

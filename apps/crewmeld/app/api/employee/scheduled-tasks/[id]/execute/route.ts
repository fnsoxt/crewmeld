import { db } from '@crewmeld/db'
import { scheduledTasks, sopDefinitions, sopExecutions } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { executeSop, transitionStatus } from '@/lib/sop/engine'
import { getSopTimeoutQueue } from '@/lib/sop/queue'

const logger = createLogger('API:ScheduledTasks:Execute')

/**
 * POST /api/employee/scheduled-tasks/:id/execute — Execute scheduled task immediately
 */
async function _POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('sop:edit')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params

    const [task] = await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, id)).limit(1)

    if (!task) {
      return apiErr('api.scheduledTask.notFound', { status: 404 })
    }

    const [definition] = await db
      .select()
      .from(sopDefinitions)
      .where(eq(sopDefinitions.id, task.sopDefinitionId))
      .limit(1)

    if (!definition) {
      return apiErr('api.scheduledTask.relatedSopNotFound', { status: 404 })
    }

    const executionId = `sopexec_${nanoid(16)}`
    const triggerData = (task.triggerData as Record<string, unknown>) ?? {}

    // Infer externally accessible baseUrl from request headers, write to _meta for notification worker
    const host = _request.headers.get('x-forwarded-host') || _request.headers.get('host')
    if (host) {
      const proto = _request.headers.get('x-forwarded-proto') || 'http'
      const baseUrl = `${proto}://${host}`
      triggerData._meta = { ...((triggerData._meta as Record<string, unknown>) ?? {}), baseUrl }
    }

    await db.insert(sopExecutions).values({
      id: executionId,
      sopDefinitionId: task.sopDefinitionId,
      sopVersion: definition.version,
      triggeredBy: auth.userId!,
      scheduledTaskId: task.id,
      status: 'pending',
      stateSnapshot: {},
      triggerData,
    })

    // Update lastRunAt
    await db
      .update(scheduledTasks)
      .set({
        lastRunAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(scheduledTasks.id, id))

    const timeoutQueue = getSopTimeoutQueue()
    if (timeoutQueue && definition.sopTimeoutMinutes > 0) {
      await timeoutQueue.add(
        'sop-timeout',
        {
          executionId,
          type: 'sop',
        },
        { delay: definition.sopTimeoutMinutes * 60 * 1000 }
      )
    }

    await transitionStatus(executionId, 'pending', 'running', {
      startedAt: new Date(),
    })

    void executeSop(executionId)

    return apiOk({ executionId })
  } catch (error) {
    logger.error('Failed to execute scheduled task', error)
    return apiErr('api.scheduledTask.executeFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)

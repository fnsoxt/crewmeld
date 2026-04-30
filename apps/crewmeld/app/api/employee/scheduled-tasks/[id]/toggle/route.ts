import { db } from '@crewmeld/db'
import { scheduledTasks } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { computeNextRunAt, registerScheduledTask, removeScheduledTask } from '@/lib/sop/scheduler'

const logger = createLogger('API:ScheduledTasks:Toggle')

/**
 * POST /api/employee/scheduled-tasks/:id/toggle — Enable/disable scheduled task
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

    const newActive = !task.isActive
    const updates: Record<string, unknown> = {
      isActive: newActive,
      updatedAt: new Date(),
    }

    if (newActive) {
      updates.nextRunAt = computeNextRunAt(task.cron, task.timezone)
      await registerScheduledTask(id, task.cron, task.timezone)
    } else {
      updates.nextRunAt = null
      await removeScheduledTask(id)
    }

    await db.update(scheduledTasks).set(updates).where(eq(scheduledTasks.id, id))

    return apiOk({ isActive: newActive })
  } catch (error) {
    logger.error('Failed to toggle scheduled task', error)
    return apiErr('api.scheduledTask.toggleFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)

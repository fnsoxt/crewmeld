import { db } from '@crewmeld/db'
import { scheduledTasks, sopDefinitions } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { computeNextRunAt, registerScheduledTask, removeScheduledTask } from '@/lib/sop/scheduler'

const logger = createLogger('API:ScheduledTasks:Id')

/**
 * PATCH /api/employee/scheduled-tasks/:id — Edit scheduled task
 */
async function _PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('sop:edit')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params
    const body = await request.json()
    const { name, sopDefinitionId, cron, timezone, triggerData } = body as {
      name?: string
      sopDefinitionId?: string
      cron?: string
      timezone?: string
      triggerData?: Record<string, unknown>
    }

    const [existing] = await db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.id, id))
      .limit(1)

    if (!existing) {
      return apiErr('api.scheduledTask.notFound', { status: 404 })
    }

    if (sopDefinitionId) {
      const [sop] = await db
        .select({ id: sopDefinitions.id })
        .from(sopDefinitions)
        .where(eq(sopDefinitions.id, sopDefinitionId))
        .limit(1)
      if (!sop) {
        return apiErr('api.scheduledTask.sopNotFound', { status: 404 })
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (name !== undefined) updates.name = name.trim()
    if (sopDefinitionId !== undefined) updates.sopDefinitionId = sopDefinitionId
    if (cron !== undefined) updates.cron = cron.trim()
    if (timezone !== undefined) updates.timezone = timezone
    if (triggerData !== undefined) updates.triggerData = triggerData

    const newCron = cron?.trim() ?? existing.cron
    const newTz = timezone ?? existing.timezone
    updates.nextRunAt = computeNextRunAt(newCron, newTz)

    await db.update(scheduledTasks).set(updates).where(eq(scheduledTasks.id, id))

    // If cron or timezone changed, re-register schedule
    if (cron || timezone) {
      await removeScheduledTask(id)
      if (existing.isActive) {
        await registerScheduledTask(id, newCron, newTz)
      }
    }

    return apiOk(null)
  } catch (error) {
    logger.error('Failed to update scheduled task', error)
    return apiErr('api.scheduledTask.updateFailed', { status: 500 })
  }
}

/**
 * DELETE /api/employee/scheduled-tasks/:id — Delete scheduled task
 */
async function _DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('sop:delete')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params

    const [existing] = await db
      .select({ id: scheduledTasks.id })
      .from(scheduledTasks)
      .where(eq(scheduledTasks.id, id))
      .limit(1)

    if (!existing) {
      return apiErr('api.scheduledTask.notFound', { status: 404 })
    }

    await removeScheduledTask(id)
    await db.delete(scheduledTasks).where(eq(scheduledTasks.id, id))

    return apiOk(null)
  } catch (error) {
    logger.error('Failed to delete scheduled task', error)
    return apiErr('api.scheduledTask.deleteFailed', { status: 500 })
  }
}

export const PATCH = withAudit(_PATCH)
export const DELETE = withAudit(_DELETE)

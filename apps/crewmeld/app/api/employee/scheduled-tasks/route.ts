import { db } from '@crewmeld/db'
import { scheduledTasks, sopDefinitions, user } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { desc, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { computeNextRunAt, registerScheduledTask } from '@/lib/sop/scheduler'

const logger = createLogger('API:ScheduledTasks')

/**
 * GET /api/employee/scheduled-tasks — Scheduled tasks list
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('sop:list')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const url = new URL(request.url)
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 20))

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(scheduledTasks)

    const total = countResult?.count ?? 0

    const rows = await db
      .select({
        id: scheduledTasks.id,
        name: scheduledTasks.name,
        sopDefinitionId: scheduledTasks.sopDefinitionId,
        sopName: sopDefinitions.name,
        cron: scheduledTasks.cron,
        timezone: scheduledTasks.timezone,
        triggerData: scheduledTasks.triggerData,
        isActive: scheduledTasks.isActive,
        lastRunAt: scheduledTasks.lastRunAt,
        nextRunAt: scheduledTasks.nextRunAt,
        createdBy: scheduledTasks.createdBy,
        createdByName: user.name,
        createdAt: scheduledTasks.createdAt,
        updatedAt: scheduledTasks.updatedAt,
      })
      .from(scheduledTasks)
      .leftJoin(sopDefinitions, eq(scheduledTasks.sopDefinitionId, sopDefinitions.id))
      .leftJoin(user, eq(scheduledTasks.createdBy, user.id))
      .orderBy(desc(scheduledTasks.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    const data = rows.map((r) => ({
      id: r.id,
      name: r.name,
      sopDefinitionId: r.sopDefinitionId,
      sopName: r.sopName ?? 'Unknown SOP',
      cron: r.cron,
      timezone: r.timezone,
      triggerData: r.triggerData as Record<string, unknown> | null,
      isActive: r.isActive,
      lastRunAt: r.lastRunAt?.toISOString() ?? null,
      nextRunAt: r.nextRunAt?.toISOString() ?? null,
      createdBy: r.createdBy,
      createdByName: r.createdByName ?? 'Unknown',
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }))

    return apiOk(data, {
      extra: { pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } },
    })
  } catch (error) {
    logger.error('Failed to fetch scheduled task list', error)
    return apiErr('api.scheduledTask.fetchListFailed', { status: 500 })
  }
}

/**
 * POST /api/employee/scheduled-tasks — Create scheduled task
 */
async function _POST(request: NextRequest) {
  try {
    const auth = await requirePermission('sop:create')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const body = await request.json()
    const { name, sopDefinitionId, cron, timezone, triggerData } = body as {
      name: string
      sopDefinitionId: string
      cron: string
      timezone?: string
      triggerData?: Record<string, unknown>
    }

    if (!name?.trim()) {
      return apiErr('api.scheduledTask.nameRequired', { status: 400 })
    }
    if (!sopDefinitionId) {
      return apiErr('api.scheduledTask.sopRequired', { status: 400 })
    }
    if (!cron?.trim()) {
      return apiErr('api.scheduledTask.cronRequired', { status: 400 })
    }

    // Verify SOP exists
    const [sop] = await db
      .select({ id: sopDefinitions.id })
      .from(sopDefinitions)
      .where(eq(sopDefinitions.id, sopDefinitionId))
      .limit(1)

    if (!sop) {
      return apiErr('api.scheduledTask.sopNotFound', { status: 404 })
    }

    const tz = timezone || 'Asia/Shanghai'
    const id = `schtask_${nanoid(16)}`
    const now = new Date()
    const nextRun = computeNextRunAt(cron, tz)

    await db.insert(scheduledTasks).values({
      id,
      name: name.trim(),
      sopDefinitionId,
      cron: cron.trim(),
      timezone: tz,
      triggerData: triggerData ?? null,
      isActive: true,
      nextRunAt: nextRun,
      createdBy: auth.userId!,
      createdAt: now,
      updatedAt: now,
    })

    // Register BullMQ repeatable job
    await registerScheduledTask(id, cron.trim(), tz)

    return apiOk({ id }, { status: 201 })
  } catch (error) {
    logger.error('Failed to create scheduled task', error)
    return apiErr('api.scheduledTask.createFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)

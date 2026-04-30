import { db } from '@crewmeld/db'
import { digitalEmployees, taskExecutions, workLogs } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { makeLogMetadata } from '@/lib/i18n/log-payload'
import { t } from '@/lib/i18n/server-t'

const logger = createLogger('EmployeeStatusAPI')

const UpdateStatusSchema = z.object({
  status: z.enum(['active', 'standby', 'paused']),
})

async function _PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('employee:edit')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params

    const body = await request.json()
    const parsed = UpdateStatusSchema.safeParse(body)
    if (!parsed.success) {
      return apiErr('api.employee.statusInvalid', { status: 400 })
    }

    const { status } = parsed.data

    const existing = await db
      .select({ id: digitalEmployees.id, activatedAt: digitalEmployees.activatedAt })
      .from(digitalEmployees)
      .where(eq(digitalEmployees.id, id))
      .limit(1)

    if (existing.length === 0) {
      return apiErr('api.employee.notFound', { status: 404 })
    }

    const now = new Date()
    const updateValues: Record<string, unknown> = {
      status,
      updatedAt: now,
    }

    if (status === 'active' && !existing[0].activatedAt) {
      updateValues.activatedAt = now
    }

    const updated = await db
      .update(digitalEmployees)
      .set(updateValues)
      .where(eq(digitalEmployees.id, id))
      .returning({
        id: digitalEmployees.id,
        status: digitalEmployees.status,
        updatedAt: digitalEmployees.updatedAt,
      })

    logger.info(`Employee ${id} status changed to ${status}`)

    // Write work log (English fallback; UI re-translates via metadata.i18nKey)
    const STATUS_CONTENT_EN: Record<string, string> = {
      active: t('api.employeeStatus.activated', undefined, 'en'),
      paused: t('api.employeeStatus.paused', undefined, 'en'),
      standby: t('api.employeeStatus.standby', undefined, 'en'),
    }
    const STATUS_I18N_KEY_MAP: Record<string, string> = {
      active: 'logActionStatusActivated',
      paused: 'logActionStatusPaused',
      standby: 'logActionStatusStandby',
    }
    const i18nKey = STATUS_I18N_KEY_MAP[status] ?? null
    const taskId = `task_${nanoid()}`
    await db.insert(taskExecutions).values({
      id: taskId,
      employeeId: id,
      triggerType: 'manual',
      status: 'success',
      input: { action: 'status_change', status, operator: auth.userId! },
      inputSummary: STATUS_CONTENT_EN[status] ?? `Status changed to ${status}`,
      outputSummary: STATUS_CONTENT_EN[status] ?? `Status changed to ${status}`,
      durationMs: 0,
      startedAt: now,
      completedAt: now,
    })
    await db.insert(workLogs).values({
      id: `log_${nanoid()}`,
      taskId,
      employeeId: id,
      logType: 'action',
      content: STATUS_CONTENT_EN[status] ?? `Status changed to ${status}`,
      metadata: i18nKey
        ? makeLogMetadata({ status, operator: auth.userId! }, { i18nKey, i18nParams: {} })
        : { status, operator: auth.userId! },
    })

    return apiOk({
      id: updated[0].id,
      status: updated[0].status,
      updatedAt: updated[0].updatedAt?.toISOString() ?? '',
    })
  } catch (error) {
    logger.error('Failed to change employee status', error)
    return apiErr('api.employee.statusUpdateFailed', { status: 500 })
  }
}

export const PATCH = withAudit(_PATCH)

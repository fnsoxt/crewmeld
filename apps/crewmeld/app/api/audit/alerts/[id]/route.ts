import { anomalyAlerts, db } from '@crewmeld/db'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import { apiErr, apiOk } from '@/lib/api/response'
import { AuditAction, AuditResourceType, recordAudit } from '@/lib/audit/log'
import { getSession } from '@/lib/auth'

const logger = createLogger('AuditAlertUpdateAPI')

const VALID_STATUSES = ['acknowledged', 'resolved'] as const

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return apiErr('api.common.unauthorized', { status: 401 })
    }

    const { id } = await params

    let body: { status?: string }
    try {
      body = await request.json()
    } catch {
      return apiErr('api.audit.invalidBody', { status: 400 })
    }

    if (!body.status || !VALID_STATUSES.includes(body.status as (typeof VALID_STATUSES)[number])) {
      return apiErr('api.audit.alertStatusInvalid', { status: 400 })
    }

    const existing = await db.select().from(anomalyAlerts).where(eq(anomalyAlerts.id, id)).limit(1)

    if (existing.length === 0) {
      return apiErr('api.audit.alertNotFound', { status: 404 })
    }

    const updateData: Record<string, unknown> = {
      status: body.status,
    }

    if (body.status === 'resolved') {
      updateData.resolvedBy = session.user.id
      updateData.resolvedAt = new Date()
    }

    const updated = await db
      .update(anomalyAlerts)
      .set(updateData)
      .where(eq(anomalyAlerts.id, id))
      .returning({
        id: anomalyAlerts.id,
        status: anomalyAlerts.status,
        resolvedBy: anomalyAlerts.resolvedBy,
        resolvedAt: anomalyAlerts.resolvedAt,
      })

    recordAudit({
      actorId: session.user.id,
      actorName: session.user.name ?? undefined,
      actorEmail: session.user.email ?? undefined,
      action: body.status === 'resolved' ? AuditAction.AUDIT_EXPORTED : AuditAction.AUDIT_EXPORTED,
      resourceType: AuditResourceType.AUDIT_EXPORT,
      resourceId: id,
      resourceName: existing[0].title,
      description: `Updated alert "${existing[0].title}" status to ${body.status}`,
      request,
    })

    const result = updated[0]

    return apiOk({
      id: result.id,
      status: result.status,
      resolvedBy: result.resolvedBy,
      resolvedAt: result.resolvedAt?.toISOString() ?? null,
    })
  } catch (error) {
    logger.error('Failed to update alert', { error })
    return apiErr('api.audit.updateAlertFailed', { status: 500 })
  }
}

import { auditLog, db } from '@crewmeld/db'
import { createLogger } from '@crewmeld/logger'
import { and, count, desc, eq, gte, ilike, lte, or } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiErr, apiOk } from '@/lib/api/response'
import { getSession } from '@/lib/auth'

const logger = createLogger('AuditLogsAPI')

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return apiErr('api.common.unauthorized', { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') ?? undefined
    const resourceType = searchParams.get('resourceType') ?? undefined
    const actorId = searchParams.get('actorId') ?? undefined
    const startDate = searchParams.get('startDate') ?? undefined
    const endDate = searchParams.get('endDate') ?? undefined
    const keyword = searchParams.get('keyword') ?? undefined
    const limitParam = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 100)
    const offsetParam = Math.max(Number(searchParams.get('offset')) || 0, 0)

    const conditions = []

    if (action) {
      // Support comma-separated multi-values (e.g. "skill,tool") and prefix matching (e.g. "employee" -> "employee.%")
      const actionParts = action
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (actionParts.length === 1) {
        const a = actionParts[0]
        if (a.includes('.')) {
          conditions.push(eq(auditLog.action, a))
        } else {
          conditions.push(ilike(auditLog.action, `${a}.%`))
        }
      } else {
        conditions.push(or(...actionParts.map((a) => ilike(auditLog.action, `${a}.%`)))!)
      }
    }
    if (resourceType) {
      // Support comma-separated multi-values (e.g. "skill,tool")
      const rtParts = resourceType
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (rtParts.length === 1) {
        conditions.push(eq(auditLog.resourceType, rtParts[0]))
      } else {
        conditions.push(or(...rtParts.map((rt) => eq(auditLog.resourceType, rt)))!)
      }
    }
    if (actorId) {
      conditions.push(eq(auditLog.actorId, actorId))
    }
    if (startDate) {
      const parsed = new Date(startDate)
      if (Number.isNaN(parsed.getTime())) {
        return apiErr('api.audit.startDateInvalid', { status: 400 })
      }
      conditions.push(gte(auditLog.createdAt, parsed))
    }
    if (endDate) {
      const parsed = new Date(endDate)
      if (Number.isNaN(parsed.getTime())) {
        return apiErr('api.audit.endDateInvalid', { status: 400 })
      }
      conditions.push(lte(auditLog.createdAt, parsed))
    }
    if (keyword) {
      const pattern = `%${keyword}%`
      conditions.push(
        or(
          ilike(auditLog.description, pattern),
          ilike(auditLog.resourceName, pattern),
          ilike(auditLog.actorName, pattern)
        )
      )
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const [logs, totalResult] = await Promise.all([
      db
        .select()
        .from(auditLog)
        .where(whereClause)
        .orderBy(desc(auditLog.createdAt))
        .limit(limitParam)
        .offset(offsetParam),
      db.select({ total: count() }).from(auditLog).where(whereClause),
    ])

    const total = totalResult[0]?.total ?? 0

    return apiOk(
      logs.map((log) => ({
        id: log.id,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        resourceName: log.resourceName,
        actorId: log.actorId,
        actorName: log.actorName,
        actorEmail: log.actorEmail,
        description: log.description,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        metadata: log.metadata ?? {},
        createdAt: log.createdAt.toISOString(),
      })),
      {
        extra: {
          pagination: {
            total,
            limit: limitParam,
            offset: offsetParam,
            hasMore: offsetParam + limitParam < total,
          },
        },
      }
    )
  } catch (error) {
    logger.error('Failed to query audit logs', { error })
    return apiErr('api.audit.queryLogsFailed', { status: 500 })
  }
}

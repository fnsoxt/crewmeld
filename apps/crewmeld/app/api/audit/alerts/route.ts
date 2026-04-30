import { anomalyAlerts, db } from '@crewmeld/db'
import { createLogger } from '@crewmeld/logger'
import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiErr, apiOk } from '@/lib/api/response'
import { getSession } from '@/lib/auth'

const logger = createLogger('AuditAlertsAPI')

const VALID_SEVERITIES = ['critical', 'warning', 'info'] as const
const VALID_STATUSES = ['open', 'acknowledged', 'resolved'] as const
const VALID_CATEGORIES = [
  'task_failure',
  'employee_error',
  'system_error',
  'performance',
  'security',
] as const

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return apiErr('api.common.unauthorized', { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const severity = searchParams.get('severity') ?? undefined
    const status = searchParams.get('status') ?? undefined
    const category = searchParams.get('category') ?? undefined
    const employeeId = searchParams.get('employeeId') ?? undefined
    const startDate = searchParams.get('startDate') ?? undefined
    const endDate = searchParams.get('endDate') ?? undefined
    const limitParam = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 100)
    const offsetParam = Math.max(Number(searchParams.get('offset')) || 0, 0)

    if (severity && !VALID_SEVERITIES.includes(severity as (typeof VALID_SEVERITIES)[number])) {
      return apiErr('api.audit.severityInvalid', { status: 400 })
    }
    if (status && !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      return apiErr('api.audit.statusInvalid', { status: 400 })
    }
    if (category && !VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) {
      return apiErr('api.audit.categoryInvalid', { status: 400 })
    }

    const conditions = []

    if (severity) {
      conditions.push(eq(anomalyAlerts.severity, severity as (typeof VALID_SEVERITIES)[number]))
    }
    if (status) {
      conditions.push(eq(anomalyAlerts.status, status as (typeof VALID_STATUSES)[number]))
    }
    if (category) {
      conditions.push(eq(anomalyAlerts.category, category as (typeof VALID_CATEGORIES)[number]))
    }
    if (employeeId) {
      conditions.push(eq(anomalyAlerts.employeeId, employeeId))
    }
    if (startDate) {
      const parsed = new Date(startDate)
      if (Number.isNaN(parsed.getTime())) {
        return apiErr('api.audit.startDateInvalid', { status: 400 })
      }
      conditions.push(gte(anomalyAlerts.createdAt, parsed))
    }
    if (endDate) {
      const parsed = new Date(endDate)
      if (Number.isNaN(parsed.getTime())) {
        return apiErr('api.audit.endDateInvalid', { status: 400 })
      }
      conditions.push(lte(anomalyAlerts.createdAt, parsed))
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const [alerts, totalResult] = await Promise.all([
      db
        .select()
        .from(anomalyAlerts)
        .where(whereClause)
        .orderBy(
          sql`CASE ${anomalyAlerts.severity}
            WHEN 'critical' THEN 0
            WHEN 'warning' THEN 1
            WHEN 'info' THEN 2
          END`,
          desc(anomalyAlerts.createdAt)
        )
        .limit(limitParam)
        .offset(offsetParam),
      db.select({ total: count() }).from(anomalyAlerts).where(whereClause),
    ])

    const total = totalResult[0]?.total ?? 0

    return apiOk(
      alerts.map((alert) => ({
        id: alert.id,
        severity: alert.severity,
        status: alert.status,
        category: alert.category,
        title: alert.title,
        description: alert.description,
        employeeId: alert.employeeId,
        employeeName: alert.employeeName,
        taskExecutionId: alert.taskExecutionId,
        errorMessage: alert.errorMessage,
        resolvedBy: alert.resolvedBy,
        resolvedAt: alert.resolvedAt?.toISOString() ?? null,
        createdAt: alert.createdAt.toISOString(),
        metadata: alert.metadata ?? undefined,
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
    logger.error('Failed to query alerts', { error })
    return apiErr('api.audit.queryAlertsFailed', { status: 500 })
  }
}

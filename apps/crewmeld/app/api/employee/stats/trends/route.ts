import { db } from '@crewmeld/db'
import { digitalEmployees, sopDefinitions, sopExecutions } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, asc, gte, lte, sql } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { formatISODate } from '@/lib/core/utils/formatting'

const logger = createLogger('StatsTrendsAPI')

const VALID_PERIODS = ['day', 'week', 'month'] as const
type Period = (typeof VALID_PERIODS)[number]

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

function generateDateSeries(from: string, to: string): string[] {
  const dates: string[] = []
  const current = new Date(from)
  const end = new Date(to)
  while (current <= end) {
    dates.push(formatISODate(current))
    current.setDate(current.getDate() + 1)
  }
  return dates
}

const EMPTY_POINT = {
  totalTasks: 0,
  successCount: 0,
  failureCount: 0,
  hitlCount: 0,
  successRate: 0,
  costRmb: '0.0000',
  tokensConsumed: 0,
  employeeDetails: [] as {
    employeeName: string
    taskCount: number
    successCount: number
    failureCount: number
  }[],
}

interface EmployeeDetailRow extends Record<string, unknown> {
  date: string
  employee_name: string
  task_count: number
  success_count: number
  failure_count: number
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('employee:list')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { searchParams } = new URL(request.url)

    const now = new Date()
    const defaultFrom = new Date(now)
    defaultFrom.setDate(defaultFrom.getDate() - 7)

    const dateFrom = searchParams.get('date_from') ?? formatISODate(defaultFrom)
    const dateTo = searchParams.get('date_to') ?? formatISODate(now)
    const period = (searchParams.get('period') ?? 'day') as string

    if (!DATE_REGEX.test(dateFrom) || !DATE_REGEX.test(dateTo)) {
      return apiErr('api.stat.dateFormatInvalid', { status: 400 })
    }

    if (!VALID_PERIODS.includes(period as Period)) {
      return apiErr('api.stat.periodInvalid', { status: 400, params: { period } })
    }

    const dateExpr = sql`(${sopExecutions.createdAt}::date)::text`
    // period is validated against VALID_PERIODS whitelist above, so sql.raw() is safe
    const dateGroupExpr =
      period === 'day'
        ? dateExpr
        : sql`date_trunc(${sql.raw(`'${period}'`)}, ${sopExecutions.createdAt})::date::text`

    const trends = await db
      .select({
        date: dateGroupExpr,
        totalTasks: sql<number>`COUNT(*)::int`,
        successCount: sql<number>`COUNT(*) FILTER (WHERE ${sopExecutions.status} IN ('completed', 'running', 'paused_for_human'))::int`,
        failureCount: sql<number>`COUNT(*) FILTER (WHERE ${sopExecutions.status} IN ('failed', 'timed_out', 'error'))::int`,
        hitlCount: sql<number>`COUNT(*) FILTER (WHERE ${sopExecutions.status} = 'paused_for_human')::int`,
        costRmb: sql<string>`'0.0000'`,
        tokensConsumed: sql<number>`0`,
      })
      .from(sopExecutions)
      .where(
        and(
          gte(sopExecutions.createdAt, sql`${dateFrom}::date`),
          lte(sopExecutions.createdAt, sql`(${dateTo}::date + interval '1 day')`)
        )
      )
      .groupBy(dateGroupExpr)
      .orderBy(asc(dateGroupExpr))

    const empDetails = await db.execute<EmployeeDetailRow>(sql`
      SELECT
        (se.created_at::date)::text AS date,
        de.name AS employee_name,
        COUNT(DISTINCT se.id)::int AS task_count,
        COUNT(DISTINCT se.id) FILTER (
          WHERE se.status IN ('completed', 'running', 'paused_for_human')
        )::int AS success_count,
        COUNT(DISTINCT se.id) FILTER (
          WHERE se.status IN ('failed', 'timed_out', 'error')
        )::int AS failure_count
      FROM ${sopExecutions} se
      INNER JOIN ${sopDefinitions} sd ON sd.id = se.sop_definition_id
      CROSS JOIN LATERAL jsonb_array_elements(sd.nodes) AS node
      INNER JOIN ${digitalEmployees} de
        ON node->>'type' = 'digital_employee'
        AND node->>'executorId' = de.id
      WHERE se.created_at >= ${dateFrom}::date
        AND se.created_at < (${dateTo}::date + interval '1 day')
      GROUP BY (se.created_at::date)::text, de.name
      ORDER BY date, task_count DESC
    `)

    const empDetailMap = new Map<
      string,
      { employeeName: string; taskCount: number; successCount: number; failureCount: number }[]
    >()
    for (const row of empDetails) {
      const date = String(row.date)
      if (!empDetailMap.has(date)) empDetailMap.set(date, [])
      empDetailMap.get(date)!.push({
        employeeName: row.employee_name,
        taskCount: Number(row.task_count),
        successCount: Number(row.success_count),
        failureCount: Number(row.failure_count),
      })
    }

    const trendMap = new Map<string, (typeof trends)[number]>()
    for (const row of trends) {
      if (row.date) trendMap.set(String(row.date), row)
    }

    const allDates = generateDateSeries(dateFrom, dateTo)
    const data = allDates.map((date) => {
      const row = trendMap.get(date)
      const details = empDetailMap.get(date) ?? []
      if (!row) {
        return { date, ...EMPTY_POINT, employeeDetails: details }
      }
      return {
        date,
        totalTasks: row.totalTasks,
        successCount: row.successCount,
        failureCount: row.failureCount,
        hitlCount: row.hitlCount,
        successRate:
          row.totalTasks > 0 ? Number(((row.successCount / row.totalTasks) * 100).toFixed(1)) : 0,
        costRmb: row.costRmb,
        tokensConsumed: row.tokensConsumed,
        employeeDetails: details,
      }
    })

    logger.info(`Report trends: ${dateFrom} to ${dateTo}, granularity=${period}`)

    return apiOk(data)
  } catch (error) {
    logger.error('Failed to fetch report trends', error)
    return apiErr('api.stat.fetchTrendsFailed', { status: 500 })
  }
}

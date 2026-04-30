import { db } from '@crewmeld/db'
import { dailyStats, digitalEmployees, sopExecutions } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, count, eq, gte, lte, sql } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { formatISODate } from '@/lib/core/utils/formatting'
import { syncTodayDailyStats } from '@/lib/stats/sync-daily-stats'

const logger = createLogger('StatsOverviewAPI')

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('employee:list')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { searchParams } = new URL(request.url)

    await syncTodayDailyStats()

    const now = new Date()
    const defaultFrom = new Date(now)
    defaultFrom.setDate(defaultFrom.getDate() - 7)

    const dateFrom = searchParams.get('date_from') ?? formatISODate(defaultFrom)
    const dateTo = searchParams.get('date_to') ?? formatISODate(now)

    if (!DATE_REGEX.test(dateFrom) || !DATE_REGEX.test(dateTo)) {
      return apiErr('api.stat.dateFormatInvalid', { status: 400 })
    }

    const [execResult] = await db
      .select({
        totalTasks: count().as('total_tasks'),
        completedCount: sql<number>`COUNT(*) FILTER (WHERE ${sopExecutions.status} IN ('completed', 'running', 'paused_for_human'))::int`,
        failureCount: sql<number>`COUNT(*) FILTER (WHERE ${sopExecutions.status} IN ('failed', 'timed_out', 'error'))::int`,
        hitlCount: sql<number>`COUNT(*) FILTER (WHERE ${sopExecutions.status} = 'paused_for_human')::int`,
      })
      .from(sopExecutions)
      .where(
        and(
          gte(sopExecutions.createdAt, sql`${dateFrom}::date`),
          lte(sopExecutions.createdAt, sql`(${dateTo}::date + interval '1 day')`)
        )
      )

    const [statsResult] = await db
      .select({
        avgDurationMs: sql<number>`COALESCE(AVG(${dailyStats.avgDurationMs}), 0)::int`,
        totalTokens: sql<number>`COALESCE(SUM(${dailyStats.tokensConsumed}), 0)::int`,
        totalCostRmb: sql<string>`COALESCE(SUM(${dailyStats.costRmb}), 0)::numeric(12,4)`,
      })
      .from(dailyStats)
      .where(and(gte(dailyStats.statDate, dateFrom), lte(dailyStats.statDate, dateTo)))

    const [empResult] = await db
      .select({ activeEmployees: count() })
      .from(digitalEmployees)
      .where(eq(digitalEmployees.status, 'active'))

    const totalTasks = execResult?.totalTasks ?? 0
    const completedCount = execResult?.completedCount ?? 0
    const failureCount = execResult?.failureCount ?? 0
    const hitlCount = execResult?.hitlCount ?? 0

    const successRate =
      totalTasks > 0 ? Number(((completedCount / totalTasks) * 100).toFixed(1)) : 0
    const failureRate = totalTasks > 0 ? Number(((failureCount / totalTasks) * 100).toFixed(1)) : 0
    const hitlRate = totalTasks > 0 ? Number(((hitlCount / totalTasks) * 100).toFixed(1)) : 0

    logger.info(`Report overview: ${dateFrom} to ${dateTo}`)

    return apiOk({
      totalTasks,
      successRate,
      failureRate,
      hitlRate,
      avgDurationMs: statsResult?.avgDurationMs ?? 0,
      totalTokens: statsResult?.totalTokens ?? 0,
      totalCostRmb: statsResult?.totalCostRmb ?? '0.0000',
      activeEmployees: empResult?.activeEmployees ?? 0,
    })
  } catch (error) {
    logger.error('Failed to fetch report overview', error)
    return apiErr('api.stat.fetchOverviewFailed', { status: 500 })
  }
}

import { db } from '@crewmeld/db'
import { dailyStats, digitalEmployees, sopExecutions } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, eq, gte, sql } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { syncTodayDailyStats } from '@/lib/stats/sync-daily-stats'

const logger = createLogger('EmployeeStatsAPI')

function getPeriodStartDate(period: string): string {
  const now = new Date()
  switch (period) {
    case 'week': {
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - now.getDay())
      return weekStart.toISOString().slice(0, 10)
    }
    case 'day':
      return now.toISOString().slice(0, 10)
    default:
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  }
}

const VALID_PERIODS = ['month', 'week', 'day'] as const

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('employee:list')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params
    const url = new URL(request.url)
    const periodParam = url.searchParams.get('period') ?? 'month'
    const period = VALID_PERIODS.includes(periodParam as (typeof VALID_PERIODS)[number])
      ? periodParam
      : 'month'

    const existing = await db
      .select({ id: digitalEmployees.id })
      .from(digitalEmployees)
      .where(eq(digitalEmployees.id, id))
      .limit(1)

    if (existing.length === 0) {
      return apiErr('api.employee.notFound', { status: 404 })
    }

    // Ensure today data is synced
    await syncTodayDailyStats()

    const periodStartDate = getPeriodStartDate(period)

    const [statsResult, pendingReview] = await Promise.all([
      // Aggregate period data from daily_stats (same data source as employee list)
      db
        .select({
          total: sql<number>`coalesce(sum(${dailyStats.totalTasks}), 0)`,
          success: sql<number>`coalesce(sum(${dailyStats.successCount}), 0)`,
          failure: sql<number>`coalesce(sum(${dailyStats.failureCount}), 0)`,
          avgDurationMs: sql<number>`coalesce(avg(${dailyStats.avgDurationMs}), 0)`,
          totalCost: sql<number>`coalesce(sum(${dailyStats.costRmb}::numeric), 0)`,
        })
        .from(dailyStats)
        .where(and(eq(dailyStats.employeeId, id), gte(dailyStats.statDate, periodStartDate))),
      // Current SOP count awaiting human approval (triggered by this employee)
      db
        .select({ count: sql<number>`count(*)` })
        .from(sopExecutions)
        .where(
          and(
            eq(sopExecutions.status, 'paused_for_human'),
            sql`(${sopExecutions.triggerData}->'_meta'->>'employeeId') = ${id}`
          )
        ),
    ])

    const total = Number(statsResult[0].total)
    const success = Number(statsResult[0].success)
    const avgDurationMs = Number(statsResult[0].avgDurationMs)

    const data = {
      period,
      tasksCompleted: total,
      successRate: total > 0 ? Number(((success / total) * 100).toFixed(1)) : 0,
      avgDuration: Math.round(avgDurationMs / 1000),
      pendingReview: Number(pendingReview[0].count),
      errorCount: Number(statsResult[0].failure),
      totalCost: Number(Number(statsResult[0].totalCost).toFixed(2)),
    }

    return apiOk(data)
  } catch (error) {
    logger.error('Failed to fetch employee stats', error)
    return apiErr('api.employee.fetchStatsFailed', { status: 500 })
  }
}

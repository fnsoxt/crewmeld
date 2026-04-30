import { db } from '@crewmeld/db'
import {
  conversations,
  digitalEmployees,
  employeeSkillBindings,
  sopDefinitions,
  sopExecutions,
  sopPauseStates,
  systemConnections,
  tools,
} from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, count, countDistinct, eq, gte, lt, sql } from 'drizzle-orm'
import { apiErr, apiOk } from '@/lib/api/response'
import { getSession } from '@/lib/auth'
import { listDatasets, loadRagflowConfig } from '@/lib/ragflow'

export const dynamic = 'force-dynamic'

const logger = createLogger('API:StatsOverview')

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return apiErr('api.common.unauthorized', { status: 401 })
    }

    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const sevenDaysAgoDate = new Date(now.getTime() - 6 * 86400000)

    const [
      employeeStats,
      monthlyTaskRows,
      lastMonthTaskRows,
      pendingRows,
      taskTrendRows,
      rankingRows,
      errorEmps,
      toolStatsRows,
      toolBoundRows,
      kbStatsRows,
      kbBoundRows,
      connStatsRows,
      sopMonthlyRows,
      sopTotalRows,
      sopDefRows,
      convMonthlyRows,
      convActiveRows,
      convByChannelRows,
    ] = await Promise.all([
      db
        .select({ status: digitalEmployees.status, count: count() })
        .from(digitalEmployees)
        .groupBy(digitalEmployees.status),

      db
        .select({
          total: count(),
          completed: count(sql`CASE WHEN ${sopExecutions.status} = 'completed' THEN 1 END`),
          failed: count(
            sql`CASE WHEN ${sopExecutions.status} IN ('failed', 'error', 'timed_out') THEN 1 END`
          ),
        })
        .from(sopExecutions)
        .where(gte(sopExecutions.createdAt, monthStartDate)),

      db
        .select({ total: count() })
        .from(sopExecutions)
        .where(
          and(
            gte(sopExecutions.createdAt, lastMonthStartDate),
            lt(sopExecutions.createdAt, monthStartDate)
          )
        ),

      db
        .select({ count: count() })
        .from(sopPauseStates)
        .where(eq(sopPauseStates.status, 'waiting')),

      db
        .select({
          date: sql<string>`to_char(${sopExecutions.createdAt}, 'YYYY-MM-DD')`,
          taskCount: count(),
        })
        .from(sopExecutions)
        .where(gte(sopExecutions.createdAt, sevenDaysAgoDate))
        .groupBy(sql`to_char(${sopExecutions.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${sopExecutions.createdAt}, 'YYYY-MM-DD')`),

      (async (): Promise<
        {
          employeeId: string
          employeeName: string
          avatar: string | null
          status: string
          todayTasks: number
          completedCount: number
        }[]
      > => {
        try {
          const rows = await db.execute<{
            employee_id: string
            employee_name: string
            avatar: string | null
            status: string
            today_tasks: string
            completed_count: string
          }>(sql`
            SELECT
              de.id            AS employee_id,
              de.name          AS employee_name,
              de.avatar,
              de.status,
              COUNT(DISTINCT se.id)                                                        AS today_tasks,
              COUNT(DISTINCT CASE WHEN se.status = 'completed' THEN se.id END)             AS completed_count
            FROM sop_executions se
            JOIN sop_definitions sd ON se.sop_definition_id = sd.id
            CROSS JOIN LATERAL jsonb_array_elements(sd.nodes) AS n(node)
            JOIN digital_employees de ON (n.node->>'executorId') = de.id
            WHERE se.created_at >= CURRENT_DATE
              AND (n.node->>'type') = 'digital_employee'
            GROUP BY de.id, de.name, de.avatar, de.status
            ORDER BY COUNT(DISTINCT se.id) DESC
            LIMIT 5
          `)
          return Array.from(rows).map((r) => ({
            employeeId: r.employee_id,
            employeeName: r.employee_name,
            avatar: r.avatar,
            status: r.status,
            todayTasks: Number(r.today_tasks),
            completedCount: Number(r.completed_count),
          }))
        } catch (rankingErr) {
          logger.error('Failed to query employee performance ranking', rankingErr)
          return []
        }
      })(),

      db
        .select({
          id: digitalEmployees.id,
          name: digitalEmployees.name,
          updatedAt: digitalEmployees.updatedAt,
        })
        .from(digitalEmployees)
        .where(eq(digitalEmployees.status, 'error')),

      db
        .select({
          total: count(),
          deployed: count(sql`CASE WHEN (${tools.deploy}->>'status') = 'deployed' THEN 1 END`),
        })
        .from(tools),

      db
        .select({ boundCount: countDistinct(employeeSkillBindings.instanceId) })
        .from(employeeSkillBindings),

      (async (): Promise<{ total: number }[]> => {
        try {
          const ragConfig = await loadRagflowConfig()
          const datasets = await listDatasets(ragConfig, { page: 1, pageSize: 1000 })
          return [{ total: datasets.length }]
        } catch {
          return [{ total: 0 }]
        }
      })(),

      (async (): Promise<{ boundCount: number }[]> => {
        try {
          const rows = await db.execute<{ bound_count: string }>(sql`
            SELECT COALESCE(COUNT(DISTINCT elem.val), 0) AS bound_count
            FROM digital_employees de
            CROSS JOIN LATERAL jsonb_array_elements_text(
              CASE WHEN jsonb_typeof(de.config->'ragflowDatasetIds') = 'array'
                   THEN de.config->'ragflowDatasetIds'
                   ELSE '[]'::jsonb END
            ) AS elem(val)
          `)
          const arr = Array.from(rows)
          return [{ boundCount: Number(arr[0]?.bound_count ?? 0) }]
        } catch {
          return [{ boundCount: 0 }]
        }
      })(),

      db
        .select({
          total: count(),
          connectedCount: count(
            sql`CASE WHEN ${systemConnections.status} = 'connected' THEN 1 END`
          ),
        })
        .from(systemConnections),

      db
        .select({
          total: count(),
          completed: count(sql`CASE WHEN ${sopExecutions.status} = 'completed' THEN 1 END`),
          failed: count(
            sql`CASE WHEN ${sopExecutions.status} IN ('failed', 'error', 'timed_out') THEN 1 END`
          ),
          running: count(
            sql`CASE WHEN ${sopExecutions.status} IN ('running', 'pending', 'paused_for_human') THEN 1 END`
          ),
        })
        .from(sopExecutions)
        .where(gte(sopExecutions.createdAt, monthStartDate)),

      db
        .select({
          total: count(),
          completed: count(sql`CASE WHEN ${sopExecutions.status} = 'completed' THEN 1 END`),
        })
        .from(sopExecutions),

      db.select({ total: count() }).from(sopDefinitions),

      db
        .select({
          total: count(),
          messageTotal: sql<number>`COALESCE(SUM(${conversations.messageCount}), 0)`,
        })
        .from(conversations)
        .where(gte(conversations.createdAt, monthStartDate)),

      db.select({ count: count() }).from(conversations).where(eq(conversations.status, 'active')),

      db
        .select({
          channel: conversations.channel,
          count: count(),
        })
        .from(conversations)
        .where(gte(conversations.createdAt, monthStartDate))
        .groupBy(conversations.channel),
    ])

    const statusMap: Record<string, number> = {}
    let totalEmployees = 0
    for (const row of employeeStats) {
      statusMap[row.status] = row.count
      totalEmployees += row.count
    }

    const monthlyResult = monthlyTaskRows[0]
    const monthlyTasks = monthlyResult?.total ?? 0
    const totalCompleted = monthlyResult?.completed ?? 0
    const totalFailed = monthlyResult?.failed ?? 0

    const lastMonthTasks = lastMonthTaskRows[0]?.total ?? 0
    const monthlyTasksGrowth =
      lastMonthTasks > 0
        ? Math.round(((monthlyTasks - lastMonthTasks) / lastMonthTasks) * 1000) / 10
        : 0

    const successDenom = totalCompleted + totalFailed
    const successRate =
      successDenom > 0 ? Math.round((totalCompleted / successDenom) * 1000) / 10 : 100

    const waitingCount = pendingRows[0]?.count ?? 0
    const errorEmployees = statusMap.error ?? 0
    const pendingItems = waitingCount + errorEmployees

    const trendMap = new Map<string, number>()
    for (const row of taskTrendRows) {
      trendMap.set(row.date, Number(row.taskCount ?? 0))
    }
    const trendData: { date: string; taskCount: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000)
      const dateStr = d.toISOString().slice(0, 10)
      trendData.push({ date: dateStr, taskCount: trendMap.get(dateStr) ?? 0 })
    }

    const employeeRanking = rankingRows.map((r) => ({
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      avatar: r.avatar,
      status: r.status,
      todayTasks: r.todayTasks,
      successRate:
        r.todayTasks > 0 ? Math.round((r.completedCount / r.todayTasks) * 1000) / 10 : 100,
    }))

    const assetOverview = {
      tools: {
        total: toolStatsRows[0]?.total ?? 0,
        deployed: toolStatsRows[0]?.deployed ?? 0,
        boundCount: toolBoundRows[0]?.boundCount ?? 0,
      },
      knowledgeBases: {
        total: kbStatsRows[0]?.total ?? 0,
        boundCount: kbBoundRows[0]?.boundCount ?? 0,
      },
      connections: {
        total: connStatsRows[0]?.total ?? 0,
        connectedCount: connStatsRows[0]?.connectedCount ?? 0,
      },
    }

    const sopMonthly = sopMonthlyRows[0]
    const sopTotal = sopTotalRows[0]
    const sopOverview = {
      definitions: sopDefRows[0]?.total ?? 0,
      monthlyExecutions: sopMonthly?.total ?? 0,
      monthlyCompleted: sopMonthly?.completed ?? 0,
      monthlyFailed: sopMonthly?.failed ?? 0,
      monthlyRunning: sopMonthly?.running ?? 0,
      totalExecutions: sopTotal?.total ?? 0,
      totalCompleted: sopTotal?.completed ?? 0,
      pendingApprovals: waitingCount,
    }

    const channelMap: Record<string, number> = {}
    for (const row of convByChannelRows) {
      const label =
        row.channel === 'web'
          ? 'Web'
          : row.channel === 'wecom'
            ? 'WeCom'
            : row.channel === 'dingtalk'
              ? 'DingTalk'
              : row.channel === 'feishu'
                ? 'Feishu'
                : row.channel === 'api'
                  ? 'API'
                  : row.channel === 'wxoa'
                    ? 'WxOA'
                    : row.channel
      channelMap[label] = row.count
    }

    const convOverview = {
      monthlyConversations: convMonthlyRows[0]?.total ?? 0,
      monthlyMessages: Number(convMonthlyRows[0]?.messageTotal ?? 0),
      activeConversations: convActiveRows[0]?.count ?? 0,
      byChannel: channelMap,
    }

    return apiOk({
      coreMetrics: {
        totalEmployees,
        activeEmployees: statusMap.active ?? 0,
        standbyEmployees: statusMap.standby ?? 0,
        pausedEmployees: statusMap.paused ?? 0,
        errorEmployees,
        monthlyTasks,
        monthlyTasksGrowth,
        successRate,
        successRateChange: 0,
        pendingItems,
        hitlWaitingCount: waitingCount,
        sopWaitingCount: waitingCount,
      },
      assetOverview,
      sopOverview,
      convOverview,
      trendData,
      employeeRanking,
    })
  } catch (error) {
    logger.error('Failed to query dashboard data', error)
    return apiErr('api.statOverview.queryFailed', { status: 500 })
  }
}

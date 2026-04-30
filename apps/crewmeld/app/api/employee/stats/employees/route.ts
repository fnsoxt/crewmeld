import { db } from '@crewmeld/db'
import {
  conversationMessages,
  conversations,
  dailyStats,
  digitalEmployees,
  employeeWorkflowBindings,
  modelUsageLogs,
  sopDefinitions,
  sopExecutions,
  taskExecutions,
} from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { sql } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { formatISODate } from '@/lib/core/utils/formatting'

const logger = createLogger('StatsEmployeesAPI')

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

interface EmployeeRow extends Record<string, unknown> {
  employee_id: string
  employee_name: string
  total_tasks: number
  success_count: number
  failure_count: number
  avg_duration_ms: number
  total_tokens: number
  total_cost_rmb: string
  conversation_count: number
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

    if (!DATE_REGEX.test(dateFrom) || !DATE_REGEX.test(dateTo)) {
      return apiErr('api.stat.dateFormatInvalid', { status: 400 })
    }

    // Aggregate multiple data sources for comprehensive stats per digital employee
    // 1. task_stats: taskExecutions direct FK (workflow executions: Dify/OpenClaw/chat-triggered)
    // 2. sop_stats: sopExecutions → sopDefinitions.nodes JSONB (SOP-level tasks)
    // 3. daily_agg: dailyStats pre-aggregated data (fallback to preserve historical data)
    // 4. conv_stats: conversations chat statistics
    // 5. model_usage_agg: modelUsageLogs → employeeWorkflowBindings (multi-model real token usage, highest priority)
    // Token/Cost takes max from each source (no stacking) since chat-triggered workflows duplicate entries across conversations and model_usage_logs
    const rows = await db.execute<EmployeeRow>(sql`
      WITH task_stats AS (
        SELECT
          te.employee_id,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE te.status IN ('success', 'running', 'hitl_waiting'))::int AS success_cnt,
          COUNT(*) FILTER (WHERE te.status = 'failed')::int AS failure_cnt,
          COALESCE(AVG(te.duration_ms), 0)::int AS avg_dur,
          COALESCE(SUM(te.tokens_used), 0)::int AS tokens,
          COALESCE(SUM(te.cost_rmb), 0)::numeric(12,4) AS cost
        FROM ${taskExecutions} te
        WHERE te.created_at >= ${dateFrom}::date
          AND te.created_at < (${dateTo}::date + interval '1 day')
        GROUP BY te.employee_id
      ),
      sop_stats AS (
        SELECT
          de.id AS employee_id,
          COUNT(DISTINCT se.id)::int AS total,
          COUNT(DISTINCT se.id) FILTER (
            WHERE se.status IN ('completed', 'running', 'paused_for_human')
          )::int AS success_cnt,
          COUNT(DISTINCT se.id) FILTER (
            WHERE se.status IN ('failed', 'timed_out', 'error')
          )::int AS failure_cnt
        FROM ${digitalEmployees} de
        INNER JOIN ${sopDefinitions} sd
          ON sd.is_active = true
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(sd.nodes) AS node
            WHERE node->>'type' = 'digital_employee'
              AND node->>'executorId' = de.id
          )
        LEFT JOIN ${sopExecutions} se
          ON se.sop_definition_id = sd.id
          AND se.created_at >= ${dateFrom}::date
          AND se.created_at < (${dateTo}::date + interval '1 day')
        GROUP BY de.id
      ),
      daily_agg AS (
        SELECT
          ds.employee_id,
          COALESCE(SUM(ds.total_tasks), 0)::int AS total,
          COALESCE(SUM(ds.success_count), 0)::int AS success_cnt,
          COALESCE(SUM(ds.failure_count), 0)::int AS failure_cnt,
          COALESCE(AVG(ds.avg_duration_ms), 0)::int AS avg_dur,
          COALESCE(SUM(ds.tokens_consumed), 0)::int AS tokens,
          COALESCE(SUM(ds.cost_rmb), 0)::numeric(12,4) AS cost
        FROM ${dailyStats} ds
        WHERE ds.stat_date >= ${dateFrom}
          AND ds.stat_date <= ${dateTo}
        GROUP BY ds.employee_id
      ),
      msg_with_lag AS (
        SELECT
          c.employee_id,
          cm.role,
          EXTRACT(EPOCH FROM (
            cm.created_at - LAG(cm.created_at) OVER (
              PARTITION BY cm.conversation_id ORDER BY cm.created_at
            )
          )) * 1000 AS gap_ms
        FROM ${conversationMessages} cm
        INNER JOIN ${conversations} c ON c.id = cm.conversation_id
        WHERE c.created_at >= ${dateFrom}::date
          AND c.created_at < (${dateTo}::date + interval '1 day')
      ),
      reply_times AS (
        SELECT employee_id, gap_ms AS reply_ms
        FROM msg_with_lag
        WHERE role = 'assistant' AND gap_ms IS NOT NULL AND gap_ms > 0
      ),
      conv_stats AS (
        SELECT
          c.employee_id,
          COUNT(*)::int AS cnt,
          COALESCE(SUM(c.total_tokens), 0)::int AS tokens
        FROM ${conversations} c
        WHERE c.created_at >= ${dateFrom}::date
          AND c.created_at < (${dateTo}::date + interval '1 day')
        GROUP BY c.employee_id
      ),
      reply_avg AS (
        SELECT
          employee_id,
          COALESCE(AVG(reply_ms) FILTER (WHERE reply_ms > 0), 0)::int AS avg_dur
        FROM reply_times
        GROUP BY employee_id
      ),
      model_usage_agg AS (
        SELECT
          ewb.employee_id,
          COALESCE(SUM(mul.tokens_total), 0)::int AS tokens,
          COALESCE(SUM(mul.cost_total), 0)::numeric(12,4) AS cost
        FROM ${modelUsageLogs} mul
        INNER JOIN ${employeeWorkflowBindings} ewb
          ON ewb.workflow_id = mul.workflow_id
        WHERE mul.created_at >= ${dateFrom}::date
          AND mul.created_at < (${dateTo}::date + interval '1 day')
        GROUP BY ewb.employee_id
      )
      SELECT
        de.id AS employee_id,
        de.name AS employee_name,
        GREATEST(
          COALESCE(ts.total, 0),
          COALESCE(ss.total, 0),
          COALESCE(da.total, 0)
        )::int AS total_tasks,
        GREATEST(
          COALESCE(ts.success_cnt, 0),
          COALESCE(ss.success_cnt, 0),
          COALESCE(da.success_cnt, 0)
        )::int AS success_count,
        GREATEST(
          COALESCE(ts.failure_cnt, 0),
          COALESCE(ss.failure_cnt, 0),
          COALESCE(da.failure_cnt, 0)
        )::int AS failure_count,
        GREATEST(
          COALESCE(ts.avg_dur, 0),
          COALESCE(da.avg_dur, 0),
          COALESCE(ra.avg_dur, 0)
        )::int AS avg_duration_ms,
        GREATEST(
          COALESCE(mu.tokens, 0),
          COALESCE(ts.tokens, 0),
          COALESCE(da.tokens, 0),
          COALESCE(cs.tokens, 0)
        )::int AS total_tokens,
        GREATEST(
          COALESCE(mu.cost, 0),
          COALESCE(ts.cost, 0),
          COALESCE(da.cost, 0)
        )::numeric(12,4) AS total_cost_rmb,
        COALESCE(cs.cnt, 0)::int AS conversation_count
      FROM ${digitalEmployees} de
      LEFT JOIN task_stats ts ON ts.employee_id = de.id
      LEFT JOIN sop_stats ss ON ss.employee_id = de.id
      LEFT JOIN daily_agg da ON da.employee_id = de.id
      LEFT JOIN conv_stats cs ON cs.employee_id = de.id
      LEFT JOIN reply_avg ra ON ra.employee_id = de.id
      LEFT JOIN model_usage_agg mu ON mu.employee_id = de.id
      ORDER BY GREATEST(
        COALESCE(ts.total, 0),
        COALESCE(ss.total, 0),
        COALESCE(da.total, 0)
      ) DESC
    `)

    const data = rows.map((row) => {
      const totalTasks = Number(row.total_tasks)
      const successCount = Number(row.success_count)
      const failureCount = Number(row.failure_count)
      return {
        employeeId: row.employee_id,
        employeeName: row.employee_name ?? 'Unknown employee',
        totalTasks,
        successRate: totalTasks > 0 ? Number(((successCount / totalTasks) * 100).toFixed(1)) : 0,
        failureRate: totalTasks > 0 ? Number(((failureCount / totalTasks) * 100).toFixed(1)) : 0,
        avgDurationMs: Number(row.avg_duration_ms),
        totalTokens: Number(row.total_tokens),
        totalCostRmb: String(row.total_cost_rmb),
        conversationCount: Number(row.conversation_count),
      }
    })

    logger.info(`Report employee comparison: ${dateFrom} to ${dateTo}, ${data.length} employees`)

    return apiOk(data)
  } catch (error) {
    logger.error('Failed to fetch employee comparison data', error)
    return apiErr('api.stat.fetchEmployeesFailed', { status: 500 })
  }
}

import { db } from '@crewmeld/db'
import { digitalEmployees, taskExecutions, workLogs } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, count, desc, eq, gte, or, sql } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'

const logger = createLogger('EmployeeLogsAPI')

const VALID_LOG_TYPES = ['action', 'decision', 'tool_call', 'llm_call', 'error'] as const
const VALID_DATE_RANGES = ['all', 'today', 'week', 'month'] as const

// Calculate date boundaries in fixed CST (UTC+8) to avoid server timezone effects
const CST_OFFSET_MS = 8 * 60 * 60 * 1000

function getCstMidnight(daysAgo = 0): Date {
  const now = new Date()
  // Offset current time to CST
  const cst = new Date(now.getTime() + CST_OFFSET_MS)
  // Get CST year/month/day, set to CST midnight, convert back to UTC
  const midnightCst = Date.UTC(cst.getUTCFullYear(), cst.getUTCMonth(), cst.getUTCDate() - daysAgo)
  return new Date(midnightCst - CST_OFFSET_MS)
}

function getDateRangeStart(range: string): Date | null {
  switch (range) {
    case 'today':
      return getCstMidnight(0)
    case 'week':
      return getCstMidnight(7)
    case 'month':
      return getCstMidnight(30)
    default:
      return null
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('employee:list')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params
    const url = new URL(request.url)
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'))
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '50')))
    const typeParam = url.searchParams.get('type')
    const dateRange = url.searchParams.get('dateRange') ?? 'all'

    const logType =
      typeParam && VALID_LOG_TYPES.includes(typeParam as (typeof VALID_LOG_TYPES)[number])
        ? typeParam
        : null

    const validDateRange = VALID_DATE_RANGES.includes(
      dateRange as (typeof VALID_DATE_RANGES)[number]
    )
      ? dateRange
      : 'all'

    const existing = await db
      .select({ id: digitalEmployees.id })
      .from(digitalEmployees)
      .where(eq(digitalEmployees.id, id))
      .limit(1)

    if (existing.length === 0) {
      return apiErr('api.employee.notFound', { status: 404 })
    }

    const conditions = [eq(workLogs.employeeId, id)]
    if (logType) {
      if (logType === 'error') {
        // "Error" category: includes logType=error, plus failed tool calls (logType=tool_call and metadata.success=false)
        conditions.push(
          or(
            eq(workLogs.logType, 'error'),
            and(
              eq(workLogs.logType, 'tool_call'),
              sql`(${workLogs.metadata}->>'success')::boolean = false`
            )
          )!
        )
      } else if (logType === 'tool_call') {
        // "Tool call" category: includes logType=tool_call, plus legacy records with logType=error from tool calls
        conditions.push(
          or(
            eq(workLogs.logType, 'tool_call'),
            and(eq(workLogs.logType, 'error'), sql`(${workLogs.metadata}->>'toolName') IS NOT NULL`)
          )!
        )
      } else {
        conditions.push(eq(workLogs.logType, logType as (typeof VALID_LOG_TYPES)[number]))
      }
    }
    const dateStart = getDateRangeStart(validDateRange)
    if (dateStart) {
      conditions.push(gte(workLogs.createdAt, dateStart))
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0]
    const offset = (page - 1) * limit

    const [rows, totalResult] = await Promise.all([
      db
        .select({
          id: workLogs.id,
          taskId: workLogs.taskId,
          timestamp: workLogs.createdAt,
          type: workLogs.logType,
          message: workLogs.content,
          metadata: workLogs.metadata,
          taskTriggerType: taskExecutions.triggerType,
          taskStatus: taskExecutions.status,
          taskInputSummary: taskExecutions.inputSummary,
          taskOutputSummary: taskExecutions.outputSummary,
          taskDurationMs: taskExecutions.durationMs,
          taskStartedAt: taskExecutions.startedAt,
        })
        .from(workLogs)
        .leftJoin(taskExecutions, eq(workLogs.taskId, taskExecutions.id))
        .where(whereClause)
        .orderBy(desc(workLogs.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(workLogs).where(whereClause),
    ])

    const data = rows.map((row) => ({
      id: row.id,
      taskId: row.taskId,
      timestamp: row.timestamp.toISOString(),
      type: row.type,
      message: row.message,
      metadata: row.metadata,
      task: row.taskTriggerType
        ? {
            triggerType: row.taskTriggerType,
            status: row.taskStatus,
            inputSummary: row.taskInputSummary,
            outputSummary: row.taskOutputSummary,
            durationMs: row.taskDurationMs,
            startedAt: row.taskStartedAt?.toISOString() ?? null,
          }
        : null,
    }))

    return apiOk(data, {
      extra: { total: totalResult[0].count, page, limit },
    })
  } catch (error) {
    logger.error('Failed to fetch employee work logs', error)
    return apiErr('api.employee.fetchLogsFailed', { status: 500 })
  }
}

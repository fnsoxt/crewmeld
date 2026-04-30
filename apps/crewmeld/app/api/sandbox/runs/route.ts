import { db } from '@crewmeld/db'
import {
  type SandboxRunStatus,
  type SandboxRunType,
  sandboxRunStatusEnum,
  sandboxRuns,
  sandboxRunTypeEnum,
} from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, desc, eq, type SQL, sql } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'

const logger = createLogger('API:Sandbox:Runs')

const RUN_TYPE_VALUES = sandboxRunTypeEnum.enumValues as readonly string[]
const STATUS_VALUES = sandboxRunStatusEnum.enumValues as readonly string[]

/**
 * GET /api/sandbox/runs — List sandbox runs (paginated, filterable by run_type / status)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('sop:list')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const url = new URL(request.url)
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 20))
    const runTypeRaw = url.searchParams.get('run_type')
    const statusRaw = url.searchParams.get('status')

    const conditions: SQL[] = []
    if (runTypeRaw && RUN_TYPE_VALUES.includes(runTypeRaw)) {
      conditions.push(eq(sandboxRuns.runType, runTypeRaw as SandboxRunType))
    }
    if (statusRaw && STATUS_VALUES.includes(statusRaw)) {
      conditions.push(eq(sandboxRuns.status, statusRaw as SandboxRunStatus))
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sandboxRuns)
      .where(whereClause)

    const total = countResult?.count ?? 0

    const rows = await db
      .select()
      .from(sandboxRuns)
      .where(whereClause)
      .orderBy(desc(sandboxRuns.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    const data = rows.map((r) => ({
      id: r.id,
      runType: r.runType,
      status: r.status,
      workflowId: r.workflowId,
      sopDefinitionId: r.sopDefinitionId,
      targetNodeId: r.targetNodeId,
      triggerData: (r.triggerData ?? {}) as Record<string, unknown>,
      policy: (r.policy ?? {}) as Record<string, unknown>,
      nodeResults: (r.nodeResults ?? []) as unknown[],
      interceptedCalls: (r.interceptedCalls ?? []) as unknown[],
      executionPath: (r.executionPath ?? []) as string[],
      errorMessage: r.errorMessage,
      totalDurationMs: r.totalDurationMs,
      totalTokensUsed: r.totalTokensUsed,
      createdBy: r.createdBy,
      startedAt: r.startedAt?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }))

    return apiOk(data, {
      extra: { pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } },
    })
  } catch (error) {
    logger.error('Failed to fetch sandbox runs list', error)
    return apiErr('api.sandbox.queryListFailed', { status: 500 })
  }
}

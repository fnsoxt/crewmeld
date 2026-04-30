import { db } from '@crewmeld/db'
import { sandboxRuns } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'

const logger = createLogger('API:Sandbox:Runs:Id')

/**
 * GET /api/sandbox/runs/:id — Sandbox run detail
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('sop:list')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params

    const [row] = await db.select().from(sandboxRuns).where(eq(sandboxRuns.id, id)).limit(1)

    if (!row) {
      return apiErr('api.sandbox.runNotFound', { status: 404 })
    }

    const data = {
      id: row.id,
      runType: row.runType,
      status: row.status,
      workflowId: row.workflowId,
      sopDefinitionId: row.sopDefinitionId,
      targetNodeId: row.targetNodeId,
      triggerData: (row.triggerData ?? {}) as Record<string, unknown>,
      policy: (row.policy ?? {}) as Record<string, unknown>,
      nodeResults: (row.nodeResults ?? []) as unknown[],
      interceptedCalls: (row.interceptedCalls ?? []) as unknown[],
      executionPath: (row.executionPath ?? []) as string[],
      errorMessage: row.errorMessage,
      totalDurationMs: row.totalDurationMs,
      totalTokensUsed: row.totalTokensUsed,
      createdBy: row.createdBy,
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }

    return apiOk(data)
  } catch (error) {
    logger.error('Failed to fetch sandbox run detail', error)
    return apiErr('api.sandbox.queryListFailed', { status: 500 })
  }
}

import { db } from '@crewmeld/db'
import { sopDefinitions, sopExecutions, sopNodeExecutions, user } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { asc, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'

const logger = createLogger('SopExecutionDetailAPI')

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('task:list')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params

    const rows = await db
      .select({
        id: sopExecutions.id,
        sopDefinitionId: sopExecutions.sopDefinitionId,
        sopName: sopDefinitions.name,
        sopVersion: sopExecutions.sopVersion,
        sopNodes: sopDefinitions.nodes,
        status: sopExecutions.status,
        triggeredBy: sopExecutions.triggeredBy,
        triggeredByName: user.name,
        stateSnapshot: sopExecutions.stateSnapshot,
        triggerData: sopExecutions.triggerData,
        errorMessage: sopExecutions.errorMessage,
        metadata: sopExecutions.metadata,
        retryCount: sopExecutions.retryCount,
        rejectionCount: sopExecutions.rejectionCount,
        startedAt: sopExecutions.startedAt,
        completedAt: sopExecutions.completedAt,
        createdAt: sopExecutions.createdAt,
      })
      .from(sopExecutions)
      .leftJoin(sopDefinitions, eq(sopExecutions.sopDefinitionId, sopDefinitions.id))
      .leftJoin(user, eq(sopExecutions.triggeredBy, user.id))
      .where(eq(sopExecutions.id, id))
      .limit(1)

    if (rows.length === 0) {
      return apiErr('api.task.executionNotFound', { status: 404 })
    }

    const exec = rows[0]

    const nodeExecs = await db
      .select({
        id: sopNodeExecutions.id,
        nodeId: sopNodeExecutions.nodeId,
        nodeName: sopNodeExecutions.nodeName,
        nodeType: sopNodeExecutions.nodeType,
        status: sopNodeExecutions.status,
        result: sopNodeExecutions.result,
        workflowRunId: sopNodeExecutions.workflowRunId,
        errorMessage: sopNodeExecutions.errorMessage,
        retryCount: sopNodeExecutions.retryCount,
        exitId: sopNodeExecutions.exitId,
        startedAt: sopNodeExecutions.startedAt,
        completedAt: sopNodeExecutions.completedAt,
        createdAt: sopNodeExecutions.createdAt,
      })
      .from(sopNodeExecutions)
      .where(eq(sopNodeExecutions.executionId, id))
      .orderBy(asc(sopNodeExecutions.createdAt))

    const snapshot = (exec.stateSnapshot ?? {}) as Record<string, unknown>
    let currentNodeName: string | null = null
    const currentNodeId = snapshot.currentNodeId as string | undefined
    if (currentNodeId && Array.isArray(exec.sopNodes)) {
      const nodeDef = (
        exec.sopNodes as Array<{ id: string; name?: string; description?: string }>
      ).find((n) => n.id === currentNodeId)
      currentNodeName = nodeDef?.name ?? nodeDef?.description ?? null
    }
    const completedNodes = nodeExecs.filter((n) => n.status === 'completed').length

    logger.info(`Fetched SOP execution detail: ${id}, ${nodeExecs.length} node records`)

    return apiOk({
      id: exec.id,
      sopDefinitionId: exec.sopDefinitionId,
      sopName: exec.sopName ?? 'Unknown SOP',
      sopVersion: exec.sopVersion,
      status: exec.status,
      triggeredBy: exec.triggeredBy,
      triggeredByName:
        exec.triggeredByName ??
        extractSenderName(exec.triggerData) ??
        exec.triggeredBy ??
        'Unknown user',
      currentNodeName,
      completedNodes,
      totalNodes: nodeExecs.length,
      errorMessage: exec.errorMessage,
      metadata: (exec.metadata ?? {}) as Record<string, unknown>,
      retryCount: exec.retryCount,
      rejectionCount: exec.rejectionCount,
      triggerData: exec.triggerData ?? {},
      stateSnapshot: exec.stateSnapshot ?? {},
      startedAt: exec.startedAt?.toISOString() ?? null,
      completedAt: exec.completedAt?.toISOString() ?? null,
      createdAt: exec.createdAt.toISOString(),
      nodeExecutions: nodeExecs.map((n) => ({
        ...n,
        startedAt: n.startedAt?.toISOString() ?? null,
        completedAt: n.completedAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    logger.error('Failed to fetch SOP execution detail', error)
    return apiErr('api.task.fetchExecutionDetailFailed', { status: 500 })
  }
}

/** Extract initiator name from triggerData._meta.senderName */
function extractSenderName(triggerData: unknown): string | null {
  if (!triggerData || typeof triggerData !== 'object') return null
  const meta = (triggerData as Record<string, unknown>)._meta as Record<string, unknown> | undefined
  if (!meta) return null
  return typeof meta.senderName === 'string' ? meta.senderName : null
}

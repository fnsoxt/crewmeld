import { db } from '@crewmeld/db'
import {
  sopDefinitions,
  sopExecutions,
  sopNodeExecutions,
  sopPauseStates,
  user,
} from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, desc, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'

const logger = createLogger('PendingListAPI')

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('task:list')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { searchParams } = new URL(request.url)
    const pauseIdFilter = searchParams.get('pause_id')

    const whereConditions = pauseIdFilter
      ? and(eq(sopPauseStates.status, 'waiting'), eq(sopPauseStates.id, pauseIdFilter))
      : eq(sopPauseStates.status, 'waiting')

    const rows = await db
      .select({
        pauseId: sopPauseStates.id,
        executionId: sopPauseStates.executionId,
        nodeId: sopPauseStates.nodeId,
        pauseStatus: sopPauseStates.status,
        assigneeId: sopPauseStates.assigneeId,
        expiresAt: sopPauseStates.expiresAt,
        pauseCreatedAt: sopPauseStates.createdAt,
        sopDefinitionId: sopExecutions.sopDefinitionId,
        sopName: sopDefinitions.name,
        sopVersion: sopExecutions.sopVersion,
        executionStatus: sopExecutions.status,
        triggeredBy: sopExecutions.triggeredBy,
        triggeredByName: user.name,
        nodeName: sopNodeExecutions.nodeName,
        nodeType: sopNodeExecutions.nodeType,
      })
      .from(sopPauseStates)
      .innerJoin(sopExecutions, eq(sopPauseStates.executionId, sopExecutions.id))
      .leftJoin(sopDefinitions, eq(sopExecutions.sopDefinitionId, sopDefinitions.id))
      .leftJoin(user, eq(sopExecutions.triggeredBy, user.id))
      .leftJoin(
        sopNodeExecutions,
        and(
          eq(sopPauseStates.executionId, sopNodeExecutions.executionId),
          eq(sopPauseStates.nodeId, sopNodeExecutions.nodeId)
        )
      )
      .where(whereConditions)
      .orderBy(desc(sopPauseStates.createdAt))
      .limit(pauseIdFilter ? 1 : 100)

    // Deduplicate: the leftJoin on sopNodeExecutions could produce multiple rows
    // if there are multiple node execution records for the same nodeId.
    const seen = new Set<string>()
    const deduped = rows.filter((r) => {
      if (seen.has(r.pauseId)) return false
      seen.add(r.pauseId)
      return true
    })

    const data = deduped.map((row) => ({
      pauseId: row.pauseId,
      executionId: row.executionId,
      sopDefinitionId: row.sopDefinitionId ?? '',
      sopName: row.sopName ?? 'Unknown SOP',
      sopVersion: row.sopVersion,
      executionStatus: row.executionStatus,
      triggeredByName: row.triggeredByName ?? 'Unknown user',
      nodeId: row.nodeId,
      nodeName: row.nodeName ?? row.nodeId,
      nodeType: row.nodeType ?? 'human_confirm',
      pauseStatus: row.pauseStatus,
      assigneeId: row.assigneeId,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.pauseCreatedAt.toISOString(),
    }))

    logger.info(`Fetched ${data.length} pending approval records`)

    return apiOk(data)
  } catch (error) {
    logger.error('Failed to fetch pending approval list', error)
    return apiErr('api.task.fetchPendingListFailed', { status: 500 })
  }
}

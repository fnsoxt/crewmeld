import { db } from '@crewmeld/db'
import { sopExecutions, sopNodeExecutions, sopPauseStates } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'

const logger = createLogger('API:Sops:ExecDetail')

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; execId: string }> }
) {
  try {
    const auth = await requirePermission('sop:list')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { id, execId } = await params

    const execRows = await db
      .select()
      .from(sopExecutions)
      .where(and(eq(sopExecutions.id, execId), eq(sopExecutions.sopDefinitionId, id)))
    const execution = execRows[0]

    if (!execution) {
      return apiErr('api.sop.executionNotFound', { status: 404 })
    }

    const nodeExecs = await db
      .select()
      .from(sopNodeExecutions)
      .where(eq(sopNodeExecutions.executionId, execId))

    const pauses = await db
      .select()
      .from(sopPauseStates)
      .where(eq(sopPauseStates.executionId, execId))

    return apiOk({
      execution,
      nodeExecutions: nodeExecs,
      pauseStates: pauses,
    })
  } catch (error) {
    logger.error('Failed to fetch execution detail', error)
    return apiErr('api.sop.fetchExecutionDetailFailed', { status: 500 })
  }
}

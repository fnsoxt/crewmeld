import { db } from '@crewmeld/db'
import {
  SOP_TERMINAL_STATUSES,
  sopDefinitions,
  sopExecutions,
  sopPauseStates,
} from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, eq } from 'drizzle-orm'
import { t } from '@/lib/core/server-i18n'
import type { TimeoutJobPayload } from '@/types/sop'

const logger = createLogger('SopTimeoutWorker')

/**
 * Timeout Worker processing logic
 *
 * Handles two types of delayed jobs:
 * - Node-level timeout: check if sop_pause_states is still waiting
 * - SOP-level timeout: check if sop_executions is still running
 *
 * Idempotent: Worker checks DB state before execution, skip if already decided/terminated
 */
export async function processTimeout(payload: TimeoutJobPayload): Promise<void> {
  logger.info('Processing timeout', { payload })

  if (payload.type === 'node' && payload.nodeId) {
    await processNodeTimeout(payload)
  } else if (payload.type === 'sop') {
    await processSopTimeout(payload)
  }
}

async function processNodeTimeout(payload: TimeoutJobPayload): Promise<void> {
  const { executionId, nodeId, pauseId } = payload
  if (!nodeId) return

  const pauseRows = pauseId
    ? await db.select().from(sopPauseStates).where(eq(sopPauseStates.id, pauseId))
    : await db
        .select()
        .from(sopPauseStates)
        .where(
          and(
            eq(sopPauseStates.executionId, executionId),
            eq(sopPauseStates.nodeId, nodeId),
            eq(sopPauseStates.status, 'waiting')
          )
        )

  const pause = pauseRows[0]
  if (!pause || pause.status !== 'waiting') {
    logger.info('Pause already decided, skipping timeout', { executionId, nodeId })
    return
  }

  const result = await db
    .update(sopPauseStates)
    .set({
      status: 'timeout',
      decision: 'timeout',
      decidedAt: new Date(),
    })
    .where(and(eq(sopPauseStates.id, pause.id), eq(sopPauseStates.status, 'waiting')))
    .returning()

  if (result.length === 0) {
    logger.info('Concurrent timeout resolution, skipping', { pauseId: pause.id })
    return
  }

  const execRows = await db.select().from(sopExecutions).where(eq(sopExecutions.id, executionId))
  const execution = execRows[0]
  if (!execution) return

  if (!execution.sopDefinitionId) return

  const defRows = await db
    .select()
    .from(sopDefinitions)
    .where(eq(sopDefinitions.id, execution.sopDefinitionId))
  const definition = defRows[0]
  if (!definition) return

  const nodes = definition.nodes as Array<{
    id: string
    exits: Array<{ condition?: { type: string }; targetNodeId: string | null }>
  }>
  const node = nodes.find((n) => n.id === nodeId)

  const hasTimeoutExit = node?.exits.some(
    (exit) => exit.condition?.type === 'approval_result' && exit.targetNodeId !== null
  )

  if (hasTimeoutExit) {
    const { resumeSopFromPause } = await import('../engine')
    await resumeSopFromPause({
      executionId,
      nodeId,
      decision: 'timeout',
      decidedBy: 'system',
      comment: t('sopApprovalTimeout'),
    })
  } else {
    const { transitionStatus } = await import('../engine')
    await transitionStatus(executionId, execution.status, 'timed_out', {
      errorMessage: t('sopNodeApprovalTimeout', 'en', { node: nodeId }),
      completedAt: new Date(),
      metadata: { errorI18nKey: 'nodeApprovalTimeout', errorI18nParams: { node: nodeId } },
    })
  }
}

async function processSopTimeout(payload: TimeoutJobPayload): Promise<void> {
  const { executionId } = payload

  const execRows = await db.select().from(sopExecutions).where(eq(sopExecutions.id, executionId))
  const execution = execRows[0]
  if (!execution) return

  if (SOP_TERMINAL_STATUSES.includes(execution.status)) {
    logger.info('SOP already in terminal state, skipping timeout', { executionId })
    return
  }

  const { transitionStatus } = await import('../engine')
  await transitionStatus(executionId, execution.status, 'timed_out', {
    errorMessage: t('sopLevelTimeout', 'en', { level: 'Task' }),
    completedAt: new Date(),
    metadata: { errorI18nKey: 'taskLevelTimeout', errorI18nParams: { level: 'Task' } },
  })

  logger.info('SOP timed out', { executionId })
}

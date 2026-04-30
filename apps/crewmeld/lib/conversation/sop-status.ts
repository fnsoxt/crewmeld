/**
 * SOP execution status query — for check_sop_status tool in conversation engine
 *
 * Data source: sopExecutions.stateSnapshot (authoritative state) + sopDefinitions.nodes (node names)
 * Does not use sopNodeExecutions table, as it may be out of sync during pause/resume scenarios.
 */

import { db, sopDefinitions, sopExecutions } from '@crewmeld/db'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import { t } from '@/lib/core/server-i18n'
import type { SopNode, SopStateSnapshot } from '@/types/sop'

const logger = createLogger('SopStatus')

const STATUS_LABEL_KEYS: Record<string, Parameters<typeof t>[0]> = {
  pending: 'sopStatusPending',
  running: 'sopStatusRunning',
  paused_for_human: 'sopStatusPausedForHuman',
  completed: 'sopStatusCompleted',
  timed_out: 'sopStatusTimedOut',
  error: 'sopStatusError',
  failed: 'sopStatusFailed',
  cancelled: 'sopStatusCancelled',
}

const NODE_STATUS_LABEL_KEYS: Record<string, Parameters<typeof t>[0]> = {
  pending: 'sopNodeStatusPending',
  running: 'sopNodeStatusRunning',
  completed: 'sopNodeStatusCompleted',
  skipped: 'sopNodeStatusSkipped',
  error: 'sopNodeStatusError',
}

function getStatusLabel(status: string, lang: string): string {
  const key = STATUS_LABEL_KEYS[status]
  return key ? t(key, lang) : status
}

function getNodeStatusLabel(status: string, lang: string): string {
  const key = NODE_STATUS_LABEL_KEYS[status]
  return key ? t(key, lang) : status
}

export interface SopStatusResult {
  found: boolean
  summary: string
}

/**
 * Query SOP execution status, return natural language summary
 */
export async function querySopExecutionStatus(
  executionId: string,
  lang = 'zh'
): Promise<SopStatusResult> {
  // 1. Query execution record (with stateSnapshot)
  const [exec] = await db
    .select({
      id: sopExecutions.id,
      status: sopExecutions.status,
      sopDefinitionId: sopExecutions.sopDefinitionId,
      stateSnapshot: sopExecutions.stateSnapshot,
      startedAt: sopExecutions.startedAt,
      completedAt: sopExecutions.completedAt,
      errorMessage: sopExecutions.errorMessage,
    })
    .from(sopExecutions)
    .where(eq(sopExecutions.id, executionId))
    .limit(1)

  if (!exec) {
    return { found: false, summary: t('sopExecutionNotFound', lang, { id: executionId }) }
  }

  // 2. Query SOP definition (name + node list)
  const [sopDef] = await db
    .select({
      name: sopDefinitions.name,
      nodes: sopDefinitions.nodes,
    })
    .from(sopDefinitions)
    .where(eq(sopDefinitions.id, exec.sopDefinitionId!))
    .limit(1)

  const sopName = sopDef?.name ?? t('sopUnknown', lang)
  const statusLabel = getStatusLabel(exec.status, lang)

  // 3. Extract node states from stateSnapshot
  const snapshot = exec.stateSnapshot as unknown as SopStateSnapshot | null
  const definitionNodes = (sopDef?.nodes ?? []) as SopNode[]

  // Build node ID -> name map
  const nodeNameMap = new Map<string, string>()
  for (const node of definitionNodes) {
    nodeNameMap.set(node.id, node.name)
  }

  // 4. Build summary
  const parts: string[] = []
  parts.push(`SOP「${sopName}」${t('status', lang)}：${statusLabel}`)

  if (snapshot && Object.keys(snapshot.nodeStates).length > 0) {
    const nodeEntries = Object.entries(snapshot.nodeStates)
    const completedCount = nodeEntries.filter(([, s]) => s.status === 'completed').length
    const totalCount = definitionNodes.length > 0 ? definitionNodes.length : nodeEntries.length
    parts.push(`${t('progress', lang)}：${completedCount}/${totalCount}`)

    // Display executed nodes in executionPath order, then append unexecuted ones
    const orderedNodeIds: string[] = [...(snapshot.executionPath ?? [])]
    for (const nodeId of Object.keys(snapshot.nodeStates)) {
      if (!orderedNodeIds.includes(nodeId)) {
        orderedNodeIds.push(nodeId)
      }
    }

    const nodeDetails = orderedNodeIds.map((nodeId) => {
      const state = snapshot.nodeStates[nodeId]
      const nodeName = nodeNameMap.get(nodeId) ?? nodeId
      const label = getNodeStatusLabel(state?.status ?? 'pending', lang)
      return `  - ${nodeName}：${label}`
    })
    parts.push(`${t('step', lang)}：\n${nodeDetails.join('\n')}`)
  }

  if (exec.errorMessage) {
    parts.push(`${t('convError', lang)}：${exec.errorMessage}`)
  }

  if (exec.startedAt) {
    parts.push(`Start: ${exec.startedAt.toISOString()}`)
  }

  if (exec.completedAt) {
    parts.push(`End: ${exec.completedAt.toISOString()}`)
  }

  logger.info(`Querying SOP status: ${executionId} → ${exec.status}`)

  return { found: true, summary: parts.join('\n') }
}

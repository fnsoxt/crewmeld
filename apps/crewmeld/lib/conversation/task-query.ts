/**
 * Task list query — for query_my_tasks tool in conversation engine
 *
 * Query SOP execution records by triggeredBy (current user), supports three filters:
 * - all: all tasks
 * - running: in progress (pending / running / paused_for_human)
 * - completed: finished (completed / failed / timed_out / error / cancelled)
 */

import { db, sopDefinitions, sopExecutions } from '@crewmeld/db'
import type { SopExecutionStatus } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { t } from '@/lib/core/server-i18n'

const logger = createLogger('TaskQuery')

const RUNNING_STATUSES: SopExecutionStatus[] = ['pending', 'running', 'paused_for_human']
const COMPLETED_STATUSES: SopExecutionStatus[] = [
  'completed',
  'failed',
  'timed_out',
  'error',
  'cancelled',
]

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

export type TaskFilter = 'all' | 'running' | 'completed'

export interface TaskQueryResult {
  summary: string
  count: number
}

function getFilterLabel(filter: TaskFilter, lang: string): string {
  if (filter === 'running') return t('taskFilterRunning', lang)
  if (filter === 'completed') return t('taskFilterCompleted', lang)
  return ''
}

function getFilterLabelForHeader(filter: TaskFilter, lang: string): string {
  if (filter === 'running') return t('taskFilterRunning', lang)
  if (filter === 'completed') return t('taskFilterCompleted', lang)
  return t('taskFilterAll', lang)
}

/**
 * Query user task list, return natural language summary
 */
export async function queryUserTasks(
  userId: string,
  filter: TaskFilter = 'all',
  limit = 10,
  lang = 'zh'
): Promise<TaskQueryResult> {
  const safeLimit = Math.min(Math.max(1, limit), 50)

  // Build filter conditions
  const conditions = [eq(sopExecutions.triggeredBy, userId)]

  if (filter === 'running') {
    conditions.push(inArray(sopExecutions.status, RUNNING_STATUSES))
  } else if (filter === 'completed') {
    conditions.push(inArray(sopExecutions.status, COMPLETED_STATUSES))
  }

  const rows = await db
    .select({
      id: sopExecutions.id,
      status: sopExecutions.status,
      sopName: sopDefinitions.name,
      errorMessage: sopExecutions.errorMessage,
      startedAt: sopExecutions.startedAt,
      completedAt: sopExecutions.completedAt,
      createdAt: sopExecutions.createdAt,
    })
    .from(sopExecutions)
    .leftJoin(sopDefinitions, eq(sopExecutions.sopDefinitionId, sopDefinitions.id))
    .where(and(...conditions))
    .orderBy(desc(sopExecutions.createdAt))
    .limit(safeLimit)

  if (rows.length === 0) {
    const filterLabel = getFilterLabel(filter, lang)
    return { summary: t('taskNoTasks', lang, { filter: filterLabel }), count: 0 }
  }

  // Build summary
  const filterLabel = getFilterLabelForHeader(filter, lang)
  const parts: string[] = []
  parts.push(t('taskListHeader', lang, { filter: filterLabel, count: String(rows.length) }))

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const sopName = row.sopName ?? t('taskUnknownProcess', lang)
    const statusKey = STATUS_LABEL_KEYS[row.status]
    const statusLabel = statusKey ? t(statusKey, lang) : row.status
    const time = row.completedAt ?? row.startedAt ?? row.createdAt
    const locale = lang === 'zh' ? 'zh-CN' : 'en-US'
    const timeStr = time.toLocaleString(locale, { timeZone: 'Asia/Shanghai' })

    let line = t('taskLineItem', lang, {
      index: String(i + 1),
      status: statusLabel,
      name: sopName,
      id: row.id,
      time: timeStr,
    })
    if (row.errorMessage) {
      line += `\n${t('taskErrorPrefix', lang, { error: row.errorMessage })}`
    }
    parts.push(line)
  }

  logger.info(
    `Querying user tasks: userId=${userId}, filter=${filter}, returned ${rows.length} records`
  )

  return { summary: parts.join('\n'), count: rows.length }
}

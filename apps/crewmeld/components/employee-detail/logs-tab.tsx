'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/core/utils/cn'
import { useTranslation } from '@/hooks/use-translation'
import { translateLogMessage } from './translate-log'

interface TaskInfo {
  triggerType: string
  status: string | null
  inputSummary: string | null
  outputSummary: string | null
  durationMs: number | null
  startedAt: string | null
}

interface WorkLog {
  id: string
  taskId: string
  timestamp: string
  type: string
  message: string
  metadata: Record<string, unknown>
  task: TaskInfo | null
}

interface TaskGroup {
  taskId: string
  task: TaskInfo | null
  logs: WorkLog[]
}

const TYPE_OPTION_KEYS = [
  { value: 'all', key: 'employees.logsTypeAll' },
  { value: 'action', key: 'employees.logTypeAction' },
  { value: 'tool_call', key: 'employees.logTypeToolCall' },
  { value: 'llm_call', key: 'employees.logTypeLlmCall' },
  { value: 'error', key: 'employees.logTypeError' },
] as const

const DATE_OPTION_KEYS = [
  { value: 'all', key: 'employees.logsDateAll' },
  { value: 'today', key: 'employees.logsDateToday' },
  { value: 'week', key: 'employees.logsDateWeek' },
  { value: 'month', key: 'employees.logsDateMonth' },
] as const

const LOG_TYPE_KEYS: Record<string, string> = {
  action: 'employees.logTypeAction',
  decision: 'employees.logTypeDecision',
  tool_call: 'employees.logTypeToolCall',
  llm_call: 'employees.logTypeLlmCall',
  error: 'employees.logTypeError',
}

const TYPE_COLORS: Record<string, string> = {
  action: 'bg-blue-100 text-blue-700',
  decision: 'bg-purple-100 text-purple-700',
  tool_call: 'bg-cyan-100 text-cyan-700',
  llm_call: 'bg-indigo-100 text-indigo-700',
  error: 'bg-red-100 text-red-700',
}

const TRIGGER_KEYS: Record<string, string> = {
  scheduled: 'employees.logsTriggerScheduled',
  manual: 'employees.logsTriggerManual',
  event: 'employees.logsTriggerEvent',
  webhook: 'employees.logsTriggerWebhook',
  api: 'employees.logsTriggerApi',
  sop: 'employees.logsTriggerSop',
  conversation: 'employees.logsTriggerConversation',
}

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  running: 'bg-blue-100 text-blue-700',
  pending: 'bg-gray-100 text-gray-500',
  hitl_waiting: 'bg-yellow-100 text-yellow-700',
}

const STATUS_KEYS: Record<string, string> = {
  success: 'employees.logsStatusSuccess',
  failed: 'employees.logsStatusFailed',
  running: 'employees.logsStatusRunning',
  pending: 'employees.logsStatusPending',
  hitl_waiting: 'employees.logsStatusHitlWaiting',
}

const PAGE_SIZE = 50

interface LogsTabProps {
  employeeId: string
}

export function LogsTab({ employeeId }: LogsTabProps) {
  const { t } = useTranslation()
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateRange, setDateRange] = useState('all')
  const [page, setPage] = useState(1)
  const [logs, setLogs] = useState<WorkLog[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set())
  const [expandedMetaIds, setExpandedMetaIds] = useState<Set<string>>(new Set())

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const fetchLogs = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setIsLoading(true)
      else setIsRefreshing(true)
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
          dateRange,
        })
        if (typeFilter !== 'all') params.set('type', typeFilter)

        const res = await fetch(`/api/employee/employees/${employeeId}/logs?${params}`)
        if (res.ok) {
          const json = await res.json()
          setLogs(json.data ?? [])
          setTotal(json.total ?? 0)
        }
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [employeeId, typeFilter, dateRange, page]
  )

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    setPage(1)
    setExpandedTaskIds(new Set())
  }, [typeFilter, dateRange])

  // Group logs by taskId, preserving order
  const taskGroups = groupByTask(logs)

  const toggleTask = (taskId: string) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const toggleMeta = (logId: string) => {
    setExpandedMetaIds((prev) => {
      const next = new Set(prev)
      if (next.has(logId)) next.delete(logId)
      else next.add(logId)
      return next
    })
  }

  return (
    <div className='space-y-4'>
      {/* Toolbar */}
      <div className='flex flex-wrap items-center gap-3'>
        <h3 className='font-medium text-gray-900 text-lg'>{t('employees.logsTitle')}</h3>
        <span className='text-gray-400 text-sm'>{t('employees.logsTotal', { count: total })}</span>
        <div className='ml-auto flex items-center gap-2'>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className='w-32'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_OPTION_KEYS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className='w-32'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTION_KEYS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant='outline'
            size='sm'
            onClick={() => fetchLogs({ silent: true })}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading && logs.length === 0 ? (
        <div className='space-y-3'>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className='h-20 animate-pulse rounded-xl bg-gray-100' />
          ))}
        </div>
      ) : taskGroups.length === 0 ? (
        <div className='flex flex-col items-center justify-center py-16 text-center'>
          <p className='text-gray-400 text-sm'>{t('employees.logsNoLogs')}</p>
          <p className='mt-1 text-gray-300 text-xs'>{t('employees.logsNoLogsHint')}</p>
        </div>
      ) : (
        <>
          <div className='space-y-3'>
            {taskGroups.map((group) => {
              const isExpanded = expandedTaskIds.has(group.taskId)
              const hasError = group.logs.some((l) => l.type === 'error')
              const taskStatus = group.task?.status ?? null

              return (
                <div
                  key={group.taskId}
                  className='overflow-hidden rounded-xl border border-gray-200 bg-white'
                >
                  {/* Task header */}
                  <button
                    type='button'
                    onClick={() => toggleTask(group.taskId)}
                    className='flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50'
                  >
                    <div className='flex flex-1 flex-wrap items-center gap-2'>
                      {/* Trigger type */}
                      <span className='font-medium text-gray-900 text-sm'>
                        {group.task
                          ? TRIGGER_KEYS[group.task.triggerType]
                            ? t(TRIGGER_KEYS[group.task.triggerType] as Parameters<typeof t>[0])
                            : group.task.triggerType
                          : t('employees.logsUnknownTask')}
                      </span>

                      {/* Task status */}
                      {taskStatus && (
                        <span
                          className={cn(
                            'rounded px-2 py-0.5 font-medium text-xs',
                            STATUS_STYLES[taskStatus] ?? 'bg-gray-100 text-gray-500'
                          )}
                        >
                          {STATUS_KEYS[taskStatus]
                            ? t(STATUS_KEYS[taskStatus] as Parameters<typeof t>[0])
                            : taskStatus}
                        </span>
                      )}

                      {/* Duration */}
                      {group.task?.durationMs != null && (
                        <span className='text-gray-400 text-xs'>
                          {formatDuration(group.task.durationMs)}
                        </span>
                      )}

                      {/* Error flag */}
                      {hasError && (
                        <span className='rounded bg-red-100 px-2 py-0.5 font-medium text-red-600 text-xs'>
                          {t('employees.logsHasError')}
                        </span>
                      )}

                      {/* Summary */}
                      {group.task?.inputSummary && (
                        <span className='max-w-xs truncate text-gray-400 text-xs'>
                          {group.task.inputSummary}
                        </span>
                      )}
                    </div>

                    <div className='flex shrink-0 items-center gap-2'>
                      <span className='text-gray-400 text-xs'>
                        {formatLogTime(group.logs[0].timestamp, t)}
                      </span>
                      <span className='rounded bg-gray-100 px-1.5 py-0.5 text-gray-500 text-xs'>
                        {t('employees.logsCountSuffix', { count: group.logs.length })}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className='h-4 w-4 text-gray-400' />
                      ) : (
                        <ChevronDown className='h-4 w-4 text-gray-400' />
                      )}
                    </div>
                  </button>

                  {/* Log list */}
                  {isExpanded && (
                    <div className='border-gray-100 border-t'>
                      {/* Output summary */}
                      {group.task?.outputSummary && (
                        <div className='border-gray-100 border-b bg-green-50 px-4 py-2'>
                          <span className='text-gray-500 text-xs'>{t('employees.logsOutput')}</span>
                          <span className='text-gray-700 text-xs'>{group.task.outputSummary}</span>
                        </div>
                      )}

                      {group.logs.map((log, idx) => {
                        const metaKeys = Object.keys(log.metadata ?? {})
                        const hasMetadata = metaKeys.length > 0
                        const isMetaExpanded = expandedMetaIds.has(log.id)

                        return (
                          <div
                            key={log.id}
                            className={cn(
                              'px-4 py-2.5',
                              idx !== group.logs.length - 1 && 'border-gray-50 border-b'
                            )}
                          >
                            <div className='flex items-start gap-2'>
                              <span className='mt-0.5 shrink-0 text-gray-400 text-xs'>
                                {formatTime(log.timestamp)}
                              </span>
                              <span
                                className={cn(
                                  'mt-0.5 inline-block shrink-0 rounded px-2 py-0.5 font-medium text-xs',
                                  TYPE_COLORS[log.type] ?? 'bg-gray-100 text-gray-700'
                                )}
                              >
                                {LOG_TYPE_KEYS[log.type]
                                  ? t(LOG_TYPE_KEYS[log.type] as Parameters<typeof t>[0])
                                  : log.type}
                              </span>
                              <span className='flex-1 text-gray-700 text-sm'>
                                {translateLogMessage(log, t)}
                              </span>
                              {hasMetadata && (
                                <button
                                  type='button'
                                  onClick={() => toggleMeta(log.id)}
                                  className='ml-1 shrink-0 rounded px-1.5 py-0.5 text-gray-400 text-xs hover:bg-gray-100 hover:text-gray-600'
                                >
                                  {isMetaExpanded
                                    ? t('employees.logsCollapse')
                                    : t('employees.logsDetail')}
                                </button>
                              )}
                            </div>
                            {isMetaExpanded && hasMetadata && (
                              <pre className='mt-2 overflow-x-auto rounded-lg bg-gray-50 p-3 text-gray-600 text-xs'>
                                {JSON.stringify(log.metadata, null, 2)}
                              </pre>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {totalPages > 1 && (
            <div className='flex items-center justify-center gap-2 pt-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className='h-4 w-4' />
              </Button>
              <span className='text-gray-500 text-sm'>
                {page} / {totalPages}
              </span>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className='h-4 w-4' />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** Group flat log list by taskId, preserving first-appearance order */
function groupByTask(logs: WorkLog[]): TaskGroup[] {
  const map = new Map<string, TaskGroup>()
  for (const log of logs) {
    const existing = map.get(log.taskId)
    if (existing) {
      existing.logs.push(log)
    } else {
      map.set(log.taskId, { taskId: log.taskId, task: log.task, logs: [log] })
    }
  }
  return Array.from(map.values())
}

// In production, timestamps are real UTC — use local methods (browser auto-converts to +8).
// In local dev, timestamps are stored as CST wall-clock but labeled UTC — use getUTC* to read raw values.
const isProduction = typeof process !== 'undefined' && !!process.env.NEXT_PUBLIC_BUILD_DATE

function getDisplayDate(d: Date) {
  return isProduction
    ? {
        year: d.getFullYear(),
        month: d.getMonth(),
        date: d.getDate(),
        hours: d.getHours(),
        minutes: d.getMinutes(),
        seconds: d.getSeconds(),
      }
    : {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth(),
        date: d.getUTCDate(),
        hours: d.getUTCHours(),
        minutes: d.getUTCMinutes(),
        seconds: d.getUTCSeconds(),
      }
}

function formatLogTime(
  iso: string,
  t: (key: string, vars?: Record<string, string | number>) => string
): string {
  const d = new Date(iso)
  const now = new Date()
  const dd = getDisplayDate(d)
  const nd = getDisplayDate(now)
  const isToday = dd.year === nd.year && dd.month === nd.month && dd.date === nd.date
  if (isToday) {
    return `${t('employees.logsToday')} ${pad(dd.hours)}:${pad(dd.minutes)}`
  }
  return `${dd.month + 1}/${dd.date} ${pad(dd.hours)}:${pad(dd.minutes)}`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const { hours, minutes, seconds } = getDisplayDate(d)
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`
}

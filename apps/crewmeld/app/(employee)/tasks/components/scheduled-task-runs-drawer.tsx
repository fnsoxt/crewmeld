'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock, Loader2, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/core/utils/cn'
import type { SupportedLocale } from '@/lib/core/utils/formatting'
import { formatCompactDateTimeI18n, formatDurationFromRange } from '@/lib/core/utils/formatting'
import { useTranslation } from '@/hooks/use-translation'
import type { ScheduledTaskItem, ScheduledTaskRun } from '../types'

interface ScheduledTaskRunsDrawerProps {
  task: ScheduledTaskItem
  onClose: () => void
}

export function ScheduledTaskRunsDrawer({ task, onClose }: ScheduledTaskRunsDrawerProps) {
  const { t, locale } = useTranslation()
  const [runs, setRuns] = useState<ScheduledTaskRun[]>([])
  const [loading, setLoading] = useState(true)

  const STATUS_CONFIG = useMemo<
    Record<string, { label: string; color: string; icon: typeof CheckCircle2 }>
  >(
    () => ({
      pending: { label: t('tasks.runsStatusPending'), color: 'text-gray-500', icon: Clock },
      running: { label: t('tasks.runsStatusRunning'), color: 'text-blue-600', icon: Loader2 },
      paused_for_human: {
        label: t('tasks.runsStatusHitlWaiting'),
        color: 'text-amber-600',
        icon: Clock,
      },
      completed: {
        label: t('tasks.runsStatusCompleted'),
        color: 'text-green-600',
        icon: CheckCircle2,
      },
      timed_out: { label: t('tasks.runsStatusTimeout'), color: 'text-red-500', icon: AlertCircle },
      error: { label: t('tasks.runsStatusError'), color: 'text-red-500', icon: XCircle },
      failed: { label: t('tasks.runsStatusFailed'), color: 'text-red-600', icon: XCircle },
      cancelled: { label: t('tasks.runsStatusCancelled'), color: 'text-gray-400', icon: XCircle },
    }),
    [t]
  )

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch(`/api/employee/scheduled-tasks/${task.id}/runs`)
      if (!res.ok) return
      const json = await res.json()
      setRuns(json.data ?? [])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [task.id])

  useEffect(() => {
    fetchRuns()
  }, [fetchRuns])

  return (
    <div className='fixed inset-0 z-30' onClick={onClose}>
      {/* Backdrop */}
      <div className='absolute inset-0 bg-black/20' />

      {/* Drawer */}
      <div
        className='absolute top-0 right-0 h-full w-[480px] overflow-y-auto bg-white shadow-2xl'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='sticky top-0 z-10 flex items-center justify-between border-gray-200 border-b bg-white px-6 py-4'>
          <div>
            <h2 className='font-semibold text-base text-gray-900'>{task.name}</h2>
            <p className='mt-0.5 text-gray-400 text-xs'>
              {task.sopName} · {task.cron}
            </p>
          </div>
          <button type='button' onClick={onClose} className='rounded-lg p-1.5 hover:bg-gray-100'>
            <X className='h-4 w-4 text-gray-400' />
          </button>
        </div>

        <div className='px-6 py-4'>
          <h3 className='mb-3 font-medium text-gray-700 text-sm'>{t('tasks.runsTitle')}</h3>

          {loading ? (
            <div className='space-y-2'>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className='h-14 animate-pulse rounded-lg bg-gray-100' />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <div className='rounded-lg border-2 border-gray-200 border-dashed py-10 text-center'>
              <Clock className='mx-auto h-8 w-8 text-gray-300' />
              <p className='mt-2 text-gray-500 text-sm'>{t('tasks.runsNoRecords')}</p>
            </div>
          ) : (
            <div className='space-y-2'>
              {runs.map((run) => {
                const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.error
                const Icon = cfg.icon
                return (
                  <div
                    key={run.id}
                    className='rounded-lg border border-gray-200 px-4 py-3'
                    data-testid={`scheduled-task-run:${run.id}`}
                  >
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-2'>
                        <Icon
                          className={cn(
                            'h-4 w-4',
                            cfg.color,
                            run.status === 'running' && 'animate-spin'
                          )}
                        />
                        <span className={cn('font-medium text-sm', cfg.color)}>{cfg.label}</span>
                      </div>
                      <span className='text-gray-400 text-xs'>
                        {formatDurationFromRange(run.startedAt, run.completedAt)}
                      </span>
                    </div>
                    <div className='mt-1 flex items-center gap-3 text-gray-400 text-xs'>
                      <span>
                        {t('tasks.runsStart', {
                          time: formatCompactDateTimeI18n(run.startedAt, locale as SupportedLocale),
                        })}
                      </span>
                      {run.completedAt && (
                        <span>
                          {t('tasks.runsEnd', {
                            time: formatCompactDateTimeI18n(
                              run.completedAt,
                              locale as SupportedLocale
                            ),
                          })}
                        </span>
                      )}
                    </div>
                    {run.errorMessage && (
                      <p className='mt-1.5 truncate text-red-500 text-xs' title={run.errorMessage}>
                        {run.errorMessage}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

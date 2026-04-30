'use client'

import { useMemo, useState } from 'react'
import {
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pause,
  Pencil,
  Play,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/core/utils/cn'
import { useTranslation } from '@/hooks/use-translation'
import type { ScheduledTaskItem } from '../types'

interface ScheduledTaskTableProps {
  items: ScheduledTaskItem[]
  isLoading: boolean
  error: string | null
  pagination: { page: number; pageSize: number; total: number; totalPages: number } | null
  onPageChange: (page: number) => void
  onRowClick: (item: ScheduledTaskItem) => void
  onEdit: (item: ScheduledTaskItem) => void
  onExecute: (item: ScheduledTaskItem) => void
  onToggle: (item: ScheduledTaskItem) => void
  onDelete: (item: ScheduledTaskItem) => void
  onRetry: () => void
}

export function ScheduledTaskTable({
  items,
  isLoading,
  error,
  pagination,
  onPageChange,
  onRowClick,
  onEdit,
  onExecute,
  onToggle,
  onDelete,
  onRetry,
}: ScheduledTaskTableProps) {
  const { t, locale } = useTranslation()
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const formatNextRun = useMemo(() => {
    return (nextRunAt: string | null): string => {
      if (!nextRunAt) return '-'
      const d = new Date(nextRunAt)
      const now = new Date()
      const diffMs = d.getTime() - now.getTime()
      if (diffMs < 0) return t('tasks.scheduledAboutToRun')
      if (diffMs < 60000)
        return t('tasks.scheduledSecondsLater', { seconds: Math.ceil(diffMs / 1000) })
      if (diffMs < 3600000)
        return t('tasks.scheduledMinutesLater', { minutes: Math.ceil(diffMs / 60000) })
      if (diffMs < 86400000)
        return t('tasks.scheduledHoursLater', { hours: Math.ceil(diffMs / 3600000) })
      return d.toLocaleString(locale, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    }
  }, [t, locale])

  const handleAction = async (
    e: React.MouseEvent,
    action: () => Promise<void> | void,
    id: string
  ) => {
    e.stopPropagation()
    setActionLoading(id)
    try {
      await action()
    } finally {
      setActionLoading(null)
    }
  }

  if (error) {
    return (
      <div className='flex flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 py-12'>
        <AlertCircle className='mb-2 h-8 w-8 text-red-400' />
        <p className='text-red-600 text-sm'>{error}</p>
        <Button variant='outline' size='sm' className='mt-3' onClick={onRetry}>
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className='space-y-2'>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className='h-14 animate-pulse rounded-lg bg-gray-200' />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center rounded-lg border-2 border-gray-200 border-dashed py-16'>
        <Calendar className='mb-3 h-10 w-10 text-gray-300' />
        <p className='font-medium text-gray-900 text-sm'>{t('tasks.scheduledNoTasks')}</p>
        <p className='mt-1 text-gray-400 text-xs'>{t('tasks.scheduledNoTasksHint')}</p>
      </div>
    )
  }

  return (
    <div>
      <div className='overflow-hidden rounded-lg border border-gray-200'>
        <table className='w-full text-sm' data-testid='scheduled-task:table'>
          <thead className='border-gray-200 border-b bg-gray-50'>
            <tr>
              <th className='px-4 py-3 text-left font-medium text-gray-500'>
                {t('tasks.scheduledColName')}
              </th>
              <th className='px-4 py-3 text-left font-medium text-gray-500'>
                {t('tasks.scheduledColSop')}
              </th>
              <th className='px-4 py-3 text-left font-medium text-gray-500'>
                {t('tasks.scheduledColSchedule')}
              </th>
              <th className='px-4 py-3 text-left font-medium text-gray-500'>
                {t('tasks.scheduledColNextRun')}
              </th>
              <th className='px-4 py-3 text-left font-medium text-gray-500'>
                {t('tasks.scheduledColStatus')}
              </th>
              <th className='px-4 py-3 text-right font-medium text-gray-500'>
                {t('tasks.scheduledColActions')}
              </th>
            </tr>
          </thead>
          <tbody className='divide-y divide-gray-100'>
            {items.map((item) => (
              <tr
                key={item.id}
                onClick={() => onRowClick(item)}
                className='cursor-pointer transition-colors hover:bg-gray-50'
                data-testid={`scheduled-task:row:${item.id}`}
              >
                <td className='px-4 py-3 font-medium text-gray-900'>{item.name}</td>
                <td className='px-4 py-3 text-gray-600'>{item.sopName}</td>
                <td className='px-4 py-3 font-mono text-gray-500 text-xs'>{item.cron}</td>
                <td className='px-4 py-3 text-gray-600'>{formatNextRun(item.nextRunAt)}</td>
                <td className='px-4 py-3'>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs',
                      item.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    )}
                  >
                    {item.isActive ? t('tasks.scheduledEnabled') : t('tasks.scheduledDisabled')}
                  </span>
                </td>
                <td className='px-4 py-3'>
                  <div
                    className='flex items-center justify-end gap-1'
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type='button'
                      onClick={(e) => handleAction(e, () => onEdit(item), `edit-${item.id}`)}
                      className='rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                      title={t('common.edit')}
                      data-testid={`scheduled-task:button:edit:${item.id}`}
                    >
                      <Pencil className='h-3.5 w-3.5' />
                    </button>
                    <button
                      type='button'
                      onClick={(e) => handleAction(e, () => onExecute(item), `exec-${item.id}`)}
                      disabled={actionLoading === `exec-${item.id}`}
                      className='rounded p-1.5 text-blue-500 hover:bg-blue-50 hover:text-blue-700'
                      title={t('tasks.scheduledRunNow')}
                      data-testid={`scheduled-task:button:execute:${item.id}`}
                    >
                      {actionLoading === `exec-${item.id}` ? (
                        <Loader2 className='h-3.5 w-3.5 animate-spin' />
                      ) : (
                        <Play className='h-3.5 w-3.5' />
                      )}
                    </button>
                    <button
                      type='button'
                      onClick={(e) => handleAction(e, () => onToggle(item), `toggle-${item.id}`)}
                      disabled={actionLoading === `toggle-${item.id}`}
                      className={cn(
                        'rounded p-1.5',
                        item.isActive
                          ? 'text-orange-500 hover:bg-orange-50 hover:text-orange-700'
                          : 'text-green-500 hover:bg-green-50 hover:text-green-700'
                      )}
                      title={item.isActive ? t('common.disable') : t('common.enable')}
                      data-testid={`scheduled-task:button:toggle:${item.id}`}
                    >
                      {actionLoading === `toggle-${item.id}` ? (
                        <Loader2 className='h-3.5 w-3.5 animate-spin' />
                      ) : item.isActive ? (
                        <Pause className='h-3.5 w-3.5' />
                      ) : (
                        <Play className='h-3.5 w-3.5' />
                      )}
                    </button>
                    <button
                      type='button'
                      onClick={(e) => handleAction(e, () => onDelete(item), `del-${item.id}`)}
                      className='rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600'
                      title={t('common.delete')}
                      data-testid={`scheduled-task:button:delete:${item.id}`}
                    >
                      <Trash2 className='h-3.5 w-3.5' />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className='mt-3 flex items-center justify-between text-gray-500 text-xs'>
          <span>{t('tasks.scheduledTotalCount', { total: pagination.total })}</span>
          <div className='flex items-center gap-2'>
            <button
              type='button'
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
              className='rounded p-1 hover:bg-gray-100 disabled:opacity-30'
            >
              <ChevronLeft className='h-4 w-4' />
            </button>
            <span>
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              type='button'
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onPageChange(pagination.page + 1)}
              className='rounded p-1 hover:bg-gray-100 disabled:opacity-30'
            >
              <ChevronRight className='h-4 w-4' />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

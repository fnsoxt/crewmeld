'use client'

import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, FlaskConical } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { SupportedLocale } from '@/lib/core/utils/formatting'
import { formatDuration, formatRelativeTimeI18n } from '@/lib/core/utils/formatting'
import { useTranslation } from '@/hooks/use-translation'
import type { SandboxRunListItem } from '../types'

interface SandboxRunTableProps {
  items: SandboxRunListItem[]
  isLoading: boolean
  error: string | null
  onRowClick: (item: SandboxRunListItem) => void
  pagination: { page: number; pageSize: number; total: number; totalPages: number } | null
  onPageChange: (page: number) => void
  onRetry?: () => void
}

export function SandboxRunTable({
  items,
  isLoading,
  error,
  onRowClick,
  pagination,
  onPageChange,
  onRetry,
}: SandboxRunTableProps) {
  const { t, locale } = useTranslation()

  const STATUS_CONFIG = useMemo<
    Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }>
  >(
    () => ({
      pending: { label: t('tasks.sandboxStatusPending'), variant: 'secondary' },
      running: { label: t('tasks.sandboxStatusRunning'), variant: 'default' },
      waiting_for_input: { label: t('tasks.sandboxStatusWaitingInput'), variant: 'secondary' },
      completed: { label: t('tasks.sandboxStatusSuccess'), variant: 'outline' },
      failed: { label: t('tasks.sandboxStatusFailed'), variant: 'destructive' },
      cancelled: { label: t('tasks.sandboxStatusCancelled'), variant: 'secondary' },
      timeout: { label: t('tasks.sandboxStatusTimeout'), variant: 'destructive' },
    }),
    [t]
  )

  const RUN_TYPE_LABELS = useMemo<Record<string, string>>(
    () => ({
      sop_run: t('tasks.sandboxTypeSop'),
    }),
    [t]
  )

  if (error) {
    return (
      <div className='flex h-64 flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50'>
        <p className='text-red-600 text-sm'>{t('tasks.loadFailedRetry')}</p>
        {onRetry && (
          <Button variant='outline' size='sm' className='mt-3' onClick={onRetry}>
            {t('common.retry')}
          </Button>
        )}
      </div>
    )
  }

  if (isLoading && items.length === 0) {
    return (
      <div className='overflow-hidden rounded-xl border border-gray-200 bg-white'>
        <div className='space-y-0'>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className='flex gap-4 border-gray-100 border-b px-4 py-3'>
              <div className='h-5 w-20 animate-pulse rounded bg-gray-200' />
              <div className='h-5 w-24 animate-pulse rounded bg-gray-200' />
              <div className='h-5 flex-1 animate-pulse rounded bg-gray-200' />
              <div className='h-5 w-16 animate-pulse rounded bg-gray-200' />
              <div className='h-5 w-24 animate-pulse rounded bg-gray-200' />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className='flex h-64 flex-col items-center justify-center rounded-xl border border-gray-300 border-dashed bg-white'>
        <FlaskConical className='h-8 w-8 text-gray-300' />
        <p className='mt-2 text-gray-400 text-sm'>{t('tasks.sandboxNoRecords')}</p>
      </div>
    )
  }

  return (
    <div className='overflow-hidden rounded-xl border border-gray-200 bg-white'>
      <div className='overflow-x-auto'>
        <table className='w-full min-w-[700px]'>
          <thead>
            <tr className='border-gray-200 border-b bg-gray-50'>
              <th className='px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase'>
                {t('tasks.sandboxColType')}
              </th>
              <th className='px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase'>
                {t('tasks.sandboxColStatus')}
              </th>
              <th className='px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase'>
                {t('tasks.sandboxColNodes')}
              </th>
              <th className='px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase'>
                {t('tasks.sandboxColIntercepts')}
              </th>
              <th className='px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase'>
                {t('tasks.sandboxColDuration')}
              </th>
              <th className='px-4 py-3 text-left font-medium text-gray-500 text-xs uppercase'>
                {t('tasks.sandboxColTime')}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const statusCfg = STATUS_CONFIG[item.status] ?? {
                label: item.status,
                variant: 'secondary' as const,
              }
              const nodeResults = Array.isArray(item.nodeResults) ? item.nodeResults : []
              const intercepted = Array.isArray(item.interceptedCalls) ? item.interceptedCalls : []

              return (
                <tr
                  key={item.id}
                  onClick={() => onRowClick(item)}
                  className='cursor-pointer border-gray-100 border-b transition-colors hover:bg-amber-50'
                  data-testid={`sandbox-run-table:row:${item.id}`}
                >
                  <td className='whitespace-nowrap px-4 py-3'>
                    <div className='flex items-center gap-1.5'>
                      <FlaskConical className='h-3.5 w-3.5 text-amber-500' />
                      <span className='font-medium text-gray-900 text-sm'>
                        {RUN_TYPE_LABELS[item.runType] ?? item.runType}
                      </span>
                    </div>
                  </td>
                  <td className='whitespace-nowrap px-4 py-3'>
                    <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                  </td>
                  <td className='whitespace-nowrap px-4 py-3 text-gray-500 text-sm'>
                    {nodeResults.length > 0 ? (
                      <span>{t('tasks.sandboxNodeCount', { count: nodeResults.length })}</span>
                    ) : (
                      <span className='text-gray-400'>—</span>
                    )}
                  </td>
                  <td className='whitespace-nowrap px-4 py-3 text-sm'>
                    {intercepted.length > 0 ? (
                      <span className='rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700 text-xs'>
                        {intercepted.length}
                      </span>
                    ) : (
                      <span className='text-gray-400'>{t('tasks.sandboxNoIntercepts')}</span>
                    )}
                  </td>
                  <td className='whitespace-nowrap px-4 py-3 text-gray-500 text-sm'>
                    {item.totalDurationMs != null
                      ? (formatDuration(item.totalDurationMs) ?? '—')
                      : '—'}
                  </td>
                  <td className='whitespace-nowrap px-4 py-3 text-gray-400 text-sm'>
                    {formatRelativeTimeI18n(item.createdAt, locale as SupportedLocale)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className='flex items-center justify-between border-gray-200 border-t px-4 py-3'>
          <span className='text-gray-500 text-sm'>
            {t('tasks.sandboxPaginationTotal', {
              total: pagination.total,
              page: pagination.page,
              totalPages: pagination.totalPages,
            })}
          </span>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
              disabled={pagination.page <= 1}
            >
              <ChevronLeft className='h-4 w-4' />
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => onPageChange(Math.min(pagination.totalPages, pagination.page + 1))}
              disabled={pagination.page >= pagination.totalPages}
            >
              <ChevronRight className='h-4 w-4' />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

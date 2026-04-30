'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/hooks/use-translation'
import type { PendingApprovalItem, UrgencyConfig } from '../types'
import { URGENCY_THRESHOLDS } from '../types'
import { ReviewDetailModal } from './review-detail-modal'

function calculateUrgency(waitingMs: number): PendingApprovalItem['urgencyLevel'] {
  const minutes = waitingMs / 60000
  if (minutes >= URGENCY_THRESHOLDS.critical) return 'critical'
  if (minutes >= URGENCY_THRESHOLDS.high) return 'high'
  if (minutes >= URGENCY_THRESHOLDS.medium) return 'medium'
  return 'low'
}

interface RawPendingItem {
  pauseId: string
  executionId: string
  sopDefinitionId: string
  sopName: string
  nodeId: string
  nodeName: string
  pauseStatus: 'waiting' | 'decided' | 'timeout'
  assigneeId: string | null
  expiresAt: string | null
  createdAt: string
}

export function PendingReviewList() {
  const { t, locale } = useTranslation()
  const [selectedPauseId, setSelectedPauseId] = useState<string | null>(null)
  const [rawItems, setRawItems] = useState<RawPendingItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const URGENCY_CONFIGS = useMemo<Record<PendingApprovalItem['urgencyLevel'], UrgencyConfig>>(
    () => ({
      critical: { color: 'text-red-700', bgColor: 'bg-red-50', text: t('tasks.priorityUrgent') },
      high: { color: 'text-orange-700', bgColor: 'bg-orange-50', text: t('tasks.priorityHigh') },
      medium: {
        color: 'text-yellow-700',
        bgColor: 'bg-yellow-50',
        text: t('tasks.priorityMedium'),
      },
      low: { color: 'text-green-700', bgColor: 'bg-green-50', text: t('tasks.priorityNormal') },
    }),
    [t]
  )

  const formatWaitingTime = useCallback(
    (ms: number): string => {
      const minutes = Math.floor(ms / 60000)
      if (minutes < 60) return t('tasks.waitingMinutes', { minutes })
      const hours = Math.floor(minutes / 60)
      const remainMinutes = minutes % 60
      if (hours < 24) return t('tasks.waitingHoursMinutes', { hours, minutes: remainMinutes })
      const days = Math.floor(hours / 24)
      return t('tasks.waitingDaysHours', { days, hours: hours % 24 })
    },
    [t]
  )

  const fetchPending = useCallback(async () => {
    try {
      const response = await fetch('/api/employee/tasks/pending-list')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const json = await response.json()
      if (json.success) {
        setRawItems(json.data)
        setError(null)
      } else {
        setError(json.error ?? t('common.unknownError'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.unknownError'))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    fetchPending()
    const interval = setInterval(fetchPending, 10000)
    return () => clearInterval(interval)
  }, [fetchPending])

  // refresh waiting time display every minute
  useEffect(() => {
    const timer = setInterval(() => setTick((prev) => prev + 1), 60000)
    return () => clearInterval(timer)
  }, [])

  const pendingItems: PendingApprovalItem[] = useMemo(() => {
    const now = Date.now()
    return rawItems
      .map((item) => {
        const waitingDurationMs = now - new Date(item.createdAt).getTime()
        return {
          ...item,
          waitingDurationMs,
          urgencyLevel: calculateUrgency(waitingDurationMs),
        }
      })
      .sort((a, b) => b.waitingDurationMs - a.waitingDurationMs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawItems, tick])

  if (isLoading && rawItems.length === 0) {
    return (
      <div className='space-y-3'>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className='animate-pulse rounded-xl border border-gray-200 bg-white p-5'>
            <div className='mb-3 h-5 w-1/3 rounded bg-gray-200' />
            <div className='mb-2 h-4 w-2/3 rounded bg-gray-100' />
            <div className='h-4 w-1/4 rounded bg-gray-100' />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className='flex h-64 flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50'>
        <p className='text-red-600 text-sm'>{t('tasks.pendingLoadFailed')}</p>
        <Button variant='outline' size='sm' className='mt-3' onClick={fetchPending}>
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  if (pendingItems.length === 0) {
    return (
      <div className='flex h-64 flex-col items-center justify-center rounded-xl border border-gray-300 border-dashed bg-white'>
        <p className='font-medium text-gray-900 text-sm'>{t('tasks.pendingNoItems')}</p>
        <p className='mt-1 text-gray-400 text-xs'>{t('tasks.pendingAllDone')}</p>
      </div>
    )
  }

  return (
    <div>
      <div className='mb-3 text-gray-500 text-sm'>
        {t('tasks.pendingCount', { count: pendingItems.length })}
      </div>
      <div className='space-y-3'>
        {pendingItems.map((item) => {
          const urgencyCfg = URGENCY_CONFIGS[item.urgencyLevel]
          return (
            <div
              key={item.pauseId}
              className='flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md'
            >
              <div className='flex-1'>
                <div className='mb-1 flex items-center gap-2'>
                  <span className='font-semibold text-gray-900 text-sm'>{item.sopName}</span>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 font-medium text-xs ${urgencyCfg.bgColor} ${urgencyCfg.color}`}
                  >
                    {urgencyCfg.text}
                  </span>
                </div>
                <p className='mb-1 text-gray-600 text-sm'>
                  {t('tasks.pendingWaitingNode')}
                  {item.nodeName}
                </p>
                <p className='text-gray-400 text-xs'>
                  {t('tasks.pendingWaitingTime', {
                    time: formatWaitingTime(item.waitingDurationMs),
                  })}
                  {item.expiresAt && (
                    <span className='ml-2'>
                      ·{' '}
                      {t('tasks.pendingExpiresAt', {
                        time: new Date(item.expiresAt).toLocaleString(locale),
                      })}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setSelectedPauseId(item.pauseId)}
                className='ml-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 font-medium text-blue-700 text-sm transition-colors hover:bg-blue-100'
              >
                {t('tasks.pendingReview')}
              </button>
            </div>
          )
        })}
      </div>

      {selectedPauseId && (
        <ReviewDetailModal
          pauseId={selectedPauseId}
          onClose={() => setSelectedPauseId(null)}
          onActionComplete={() => {
            setSelectedPauseId(null)
            fetchPending()
          }}
        />
      )}
    </div>
  )
}

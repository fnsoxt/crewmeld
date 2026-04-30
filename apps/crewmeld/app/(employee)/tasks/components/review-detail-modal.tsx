'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/hooks/use-translation'
import { ReviewActions } from './review-actions'

interface PauseDetailData {
  pauseId: string
  executionId: string
  sopName: string
  nodeId: string
  nodeName: string
  nodeType: string
  assigneeId: string | null
  expiresAt: string | null
  createdAt: string
  executionStatus: string
  sopVersion: number
  triggeredByName: string
}

interface ReviewDetailModalProps {
  pauseId: string
  onClose: () => void
  onActionComplete: () => void
}

export function ReviewDetailModal({ pauseId, onClose, onActionComplete }: ReviewDetailModalProps) {
  const { t, locale } = useTranslation()
  const [data, setData] = useState<PauseDetailData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDetail = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/employee/tasks/pending-list?pause_id=${pauseId}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const json = await response.json()
      if (json.success && json.data?.length > 0) {
        const item = json.data[0]
        setData({
          pauseId: item.pauseId,
          executionId: item.executionId,
          sopName: item.sopName,
          nodeId: item.nodeId,
          nodeName: item.nodeName,
          nodeType: item.nodeType ?? 'human_confirm',
          assigneeId: item.assigneeId,
          expiresAt: item.expiresAt,
          createdAt: item.createdAt,
          executionStatus: item.executionStatus ?? 'paused_for_human',
          sopVersion: item.sopVersion ?? 1,
          triggeredByName: item.triggeredByName ?? '—',
        })
        setError(null)
      } else {
        setError(t('tasks.reviewDetailNotFound'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.unknownError'))
    } finally {
      setIsLoading(false)
    }
  }, [pauseId, t])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  return (
    <div
      className='fixed inset-0 z-40 flex items-center justify-center bg-black/30'
      onClick={onClose}
    >
      <div
        className='relative max-h-[85vh] w-[560px] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='mb-4 flex items-center justify-between'>
          <h2 className='font-semibold text-gray-900 text-lg'>{t('tasks.reviewDetailTitle')}</h2>
          <Button variant='ghost' size='icon' onClick={onClose}>
            <X className='h-5 w-5' />
          </Button>
        </div>

        {isLoading && (
          <div className='space-y-4'>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className='animate-pulse'>
                <div className='mb-2 h-4 w-1/4 rounded bg-gray-200' />
                <div className='h-16 rounded-lg bg-gray-100' />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className='flex flex-col items-center justify-center py-12'>
            <AlertTriangle className='h-8 w-8 text-red-400' />
            <p className='mt-2 text-red-600 text-sm'>{error}</p>
            <Button variant='outline' size='sm' className='mt-3' onClick={fetchDetail}>
              {t('common.retry')}
            </Button>
          </div>
        )}

        {data && (
          <>
            <div className='mb-4 rounded-lg bg-gray-50 p-4'>
              <div className='grid grid-cols-2 gap-3 text-sm'>
                <div>
                  <span className='text-gray-400'>{t('tasks.reviewDetailSop')}</span>
                  <span className='font-medium text-gray-900'>{data.sopName}</span>
                  <span className='ml-1 text-gray-400 text-xs'>v{data.sopVersion}</span>
                </div>
                <div>
                  <span className='text-gray-400'>{t('tasks.reviewDetailWaitingNode')}</span>
                  <span className='text-gray-700'>{data.nodeName}</span>
                </div>
                <div>
                  <span className='text-gray-400'>{t('tasks.reviewDetailTrigger')}</span>
                  <span className='text-gray-700'>{data.triggeredByName}</span>
                </div>
                <div>
                  <span className='text-gray-400'>{t('tasks.reviewDetailCreatedAt')}</span>
                  <span className='text-gray-700'>
                    {new Date(data.createdAt).toLocaleString(locale)}
                  </span>
                </div>
                {data.expiresAt && (
                  <div className='col-span-2'>
                    <span className='text-gray-400'>{t('tasks.reviewDetailExpiresAt')}</span>
                    <span className='text-orange-600'>
                      {new Date(data.expiresAt).toLocaleString(locale)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className='mb-4 rounded-lg border border-blue-100 bg-blue-50 p-4'>
              <p className='text-blue-800 text-sm'>
                {t('tasks.reviewDetailSopReached')}
                <Badge variant='secondary' className='mx-1'>
                  {data.nodeName}
                </Badge>
                {t('tasks.reviewDetailNodeNeedConfirm')}
              </p>
            </div>

            <div className='my-4 border-gray-200 border-t' />

            <ReviewActions pauseId={pauseId} onActionComplete={onActionComplete} />
          </>
        )}
      </div>
    </div>
  )
}

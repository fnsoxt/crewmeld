'use client'

import { useState } from 'react'
import { useTranslation } from '@/hooks/use-translation'
import { useReviewAction } from '../hooks/use-review-action'

interface ReviewActionsProps {
  pauseId: string
  onActionComplete: () => void
}

type ActionMode = 'idle' | 'approving' | 'rejecting'

export function ReviewActions({ pauseId, onActionComplete }: ReviewActionsProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<ActionMode>('idle')
  const [comment, setComment] = useState('')
  const { approve, reject, isSubmitting, error } = useReviewAction()

  const handleApprove = async () => {
    if (mode !== 'approving') {
      setMode('approving')
      return
    }
    const success = await approve(pauseId, comment)
    if (success) {
      onActionComplete()
    }
  }

  const handleReject = async () => {
    if (mode !== 'rejecting') {
      setMode('rejecting')
      return
    }
    if (!comment.trim()) return
    const success = await reject(pauseId, comment)
    if (success) {
      onActionComplete()
    }
  }

  return (
    <div>
      {error && <div className='mb-3 rounded-lg bg-red-50 p-3 text-red-600 text-sm'>{error}</div>}

      {mode === 'approving' && (
        <div className='mb-3'>
          <label htmlFor='review-approve-comment' className='mb-1 block text-gray-600 text-sm'>
            {t('tasks.reviewNotesOptional')}
          </label>
          <textarea
            id='review-approve-comment'
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('tasks.reviewNotesPlaceholder')}
            maxLength={500}
            rows={2}
            className='w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-700 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
          />
        </div>
      )}

      {mode === 'rejecting' && (
        <div className='mb-3'>
          <label htmlFor='review-reject-comment' className='mb-1 block text-gray-600 text-sm'>
            {t('tasks.reviewRejectReason')} <span className='text-red-500'>*</span>
          </label>
          <textarea
            id='review-reject-comment'
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('tasks.reviewRejectPlaceholder')}
            maxLength={1000}
            rows={3}
            className='w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-700 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
          />
          {comment.length === 0 && (
            <p className='mt-1 text-red-500 text-xs'>{t('tasks.reviewRejectRequired')}</p>
          )}
        </div>
      )}

      <div className='flex gap-3'>
        <button
          onClick={handleApprove}
          disabled={isSubmitting || mode === 'rejecting'}
          className='flex-1 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-sm text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
        >
          {isSubmitting && mode === 'approving'
            ? t('tasks.reviewSubmitting')
            : mode === 'approving'
              ? t('tasks.reviewConfirmApprove')
              : t('tasks.reviewApprove')}
        </button>
        <button
          onClick={handleReject}
          disabled={
            isSubmitting || mode === 'approving' || (mode === 'rejecting' && !comment.trim())
          }
          className='flex-1 rounded-lg border border-red-300 px-4 py-2.5 font-medium text-red-600 text-sm transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50'
        >
          {isSubmitting && mode === 'rejecting'
            ? t('tasks.reviewSubmitting')
            : mode === 'rejecting'
              ? t('tasks.reviewConfirmReject')
              : t('tasks.reviewReject')}
        </button>
      </div>

      {mode !== 'idle' && (
        <button
          onClick={() => {
            setMode('idle')
            setComment('')
          }}
          disabled={isSubmitting}
          className='mt-2 w-full text-center text-gray-400 text-xs hover:text-gray-600'
        >
          {t('common.cancel')}
        </button>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useTranslation } from '@/hooks/use-translation'
import { LocaleOverrideProvider } from '@/stores/locale/locale-override'

const CHANNEL_KEY_MAP: Record<string, string> = {
  web: 'approval.channelWeb',
  dingtalk: 'approval.channelDingtalk',
  feishu: 'approval.channelFeishu',
  wecom: 'approval.channelWecom',
  discord: 'approval.channelDiscord',
  telegram: 'approval.channelTelegram',
}

interface ApprovalPageClientProps {
  pauseId: string
  sopName: string
  nodeName: string
  expiresAt: string | null
  token: string
  initialDecision: 'approved' | 'rejected' | null
  senderName: string | null
  channel: string | null
  language: 'zh-CN' | 'en'
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error' | 'conflict'

export function ApprovalPageClient(props: ApprovalPageClientProps) {
  // Render the approval page in the SOP's language without mutating the
  // operator's main-app locale preference (no store / cookie / localStorage
  // writes). The provider only sets <html lang> while mounted.
  return (
    <LocaleOverrideProvider value={props.language}>
      <ApprovalPageContent {...props} />
    </LocaleOverrideProvider>
  )
}

function ApprovalPageContent({
  pauseId,
  sopName,
  nodeName,
  expiresAt,
  token,
  initialDecision,
  senderName,
  channel,
}: ApprovalPageClientProps) {
  const { t, locale } = useTranslation()
  const [comment, setComment] = useState('')
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [resultDecision, setResultDecision] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState('')

  const decisionText = (d: 'approved' | 'rejected') =>
    d === 'approved' ? t('approval.approve') : t('approval.reject')

  const channelLabel = (ch: string) => {
    const key = CHANNEL_KEY_MAP[ch]
    return key ? t(key as Parameters<typeof t>[0]) : ch
  }

  const handleDecide = async (decision: 'approved' | 'rejected') => {
    setSubmitState('submitting')
    setErrorMessage('')

    try {
      const res = await fetch(
        `/api/employee/sops/pause/${pauseId}/decide?token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision, comment: comment.trim() || undefined }),
        }
      )

      const json = await res.json()

      if (res.status === 409) {
        setSubmitState('conflict')
        return
      }

      if (!json.success) {
        setErrorMessage(json.error ?? t('common.operationFailed'))
        setSubmitState('error')
        return
      }

      setResultDecision(decisionText(decision))
      setSubmitState('success')
    } catch {
      setErrorMessage(t('common.networkError'))
      setSubmitState('error')
    }
  }

  if (submitState === 'success') {
    return (
      <div className='rounded-lg border border-green-200 bg-white p-8 text-center shadow-sm'>
        <div className='mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100'>
          <svg
            className='h-6 w-6 text-green-500'
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
          >
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' />
          </svg>
        </div>
        <h2 className='mb-2 font-semibold text-gray-900 text-lg'>{t('approval.successTitle')}</h2>
        <p className='text-gray-500 text-sm' data-testid='approval:success-message'>
          {t('approval.successDesc', { decision: resultDecision })}
        </p>
      </div>
    )
  }

  if (submitState === 'conflict') {
    return (
      <div className='rounded-lg border border-yellow-200 bg-white p-8 text-center shadow-sm'>
        <div className='mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100'>
          <svg
            className='h-6 w-6 text-yellow-500'
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z'
            />
          </svg>
        </div>
        <h2 className='mb-2 font-semibold text-gray-900 text-lg'>{t('approval.processedTitle')}</h2>
        <p className='text-gray-500 text-sm'>{t('approval.processedDesc')}</p>
      </div>
    )
  }

  const decisionLabel = initialDecision ? decisionText(initialDecision) : null

  return (
    <div className='rounded-lg border bg-white p-6 shadow-sm' data-testid='approval:form'>
      <h2 className='mb-1 font-semibold text-gray-900 text-lg'>{sopName}</h2>
      <p className='mb-4 text-gray-500 text-sm'>{t('approval.formSubtitle', { name: nodeName })}</p>

      {expiresAt && (
        <p className='mb-4 text-gray-400 text-xs'>
          {t('approval.formDeadline', {
            date: new Date(expiresAt).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US'),
          })}
        </p>
      )}

      {initialDecision && (
        <div
          className={`mb-4 rounded-md border px-4 py-3 text-sm ${
            initialDecision === 'approved'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {t('approval.formConfirmDecision', { decision: decisionLabel! })}
        </div>
      )}

      <div className='mb-4'>
        <label htmlFor='approval-comment' className='mb-1 block font-medium text-gray-700 text-sm'>
          {t('approval.commentLabel')}
        </label>
        <Textarea
          id='approval-comment'
          placeholder={t('approval.commentPlaceholder')}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          disabled={submitState === 'submitting'}
          data-testid='approval:input:comment'
        />
      </div>

      {senderName && (
        <div className='mb-4 rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-blue-800 text-sm'>
          <span className='font-medium'>{t('approval.sender')}</span>
          {locale === 'zh-CN' ? '：' : ': '}
          {senderName}
          {channel && (
            <span className='ml-2 text-blue-600'>
              {locale === 'zh-CN' ? '（' : '('}
              {t('approval.fromChannel', { channel: channelLabel(channel) })}
              {locale === 'zh-CN' ? '）' : ')'}
            </span>
          )}
        </div>
      )}

      {submitState === 'error' && <p className='mb-4 text-red-500 text-sm'>{errorMessage}</p>}

      <div className='flex gap-3'>
        <Button
          className='flex-1'
          variant='destructive'
          onClick={() => handleDecide('rejected')}
          disabled={submitState === 'submitting'}
          data-testid='approval:btn:reject'
        >
          {t('approval.reject')}
        </Button>
        <Button
          className='flex-1'
          onClick={() => handleDecide('approved')}
          disabled={submitState === 'submitting'}
          data-testid='approval:btn:approve'
        >
          {t('approval.approve')}
        </Button>
      </div>

      {initialDecision && (
        <div className='mt-3 flex justify-center'>
          <Button
            variant='default'
            size='lg'
            className='w-full'
            onClick={() => handleDecide(initialDecision)}
            disabled={submitState === 'submitting'}
            data-testid='approval:btn:confirm-decision'
          >
            {submitState === 'submitting'
              ? t('common.submitting')
              : t('approval.confirmAction', { decision: decisionLabel! })}
          </Button>
        </div>
      )}
    </div>
  )
}

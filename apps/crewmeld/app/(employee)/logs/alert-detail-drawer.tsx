'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/core/utils/cn'
import type { SupportedLocale } from '@/lib/core/utils/formatting'
import { formatDateTimeI18n } from '@/lib/core/utils/formatting'
import { translateAlertField } from '@/lib/i18n/translate-alert-field'
import type { AnomalyAlertItem } from '@/app/api/audit/types'
import { useTranslation } from '@/hooks/use-translation'

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  warning: 'bg-yellow-100 text-yellow-800',
  info: 'bg-blue-100 text-blue-800',
}

interface AlertDetailDrawerProps {
  alert: AnomalyAlertItem | null
  open: boolean
  onClose: () => void
  onStatusChange: (id: string, status: 'acknowledged' | 'resolved') => void
}

export function AlertDetailDrawer({
  alert,
  open,
  onClose,
  onStatusChange,
}: AlertDetailDrawerProps) {
  const { t, locale } = useTranslation()
  const [updating, setUpdating] = useState(false)

  const SEVERITY_LABELS: Record<string, string> = useMemo(
    () => ({
      critical: t('logs.alertSeverityCritical'),
      warning: t('logs.alertSeverityWarning'),
      info: t('logs.alertSeverityInfo'),
    }),
    [t]
  )

  const CATEGORY_LABELS: Record<string, string> = useMemo(
    () => ({
      task_failure: t('logs.alertCategoryTaskFailure'),
      employee_error: t('logs.alertCategoryEmployeeError'),
      system_error: t('logs.alertCategorySystemError'),
      performance: t('logs.alertCategoryPerformance'),
      security: t('logs.alertCategorySecurity'),
    }),
    [t]
  )

  const STATUS_LABELS: Record<string, string> = useMemo(
    () => ({
      open: t('logs.alertStatusOpen'),
      acknowledged: t('logs.alertStatusAcknowledged'),
      resolved: t('logs.alertStatusResolved'),
    }),
    [t]
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open || !alert) return null

  const handleAction = async (status: 'acknowledged' | 'resolved') => {
    setUpdating(true)
    try {
      await onStatusChange(alert.id, status)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <>
      {/* Overlay */}
      <div className='fixed inset-0 z-40 bg-black/30' onClick={onClose} />

      {/* Drawer */}
      <div className='fixed top-0 right-0 z-50 flex h-full w-96 flex-col bg-white shadow-xl'>
        <div className='flex items-center justify-between border-gray-200 border-b px-6 py-4'>
          <h2 className='font-medium text-gray-900 text-lg'>{t('logs.alertDetailTitle')}</h2>
          <button type='button' onClick={onClose} className='text-gray-400 hover:text-gray-600'>
            ✕
          </button>
        </div>

        <div className='flex-1 overflow-auto px-6 py-4'>
          <div className='space-y-4'>
            {/* Severity + Status */}
            <div className='flex items-center gap-2'>
              <span
                className={cn(
                  'rounded px-2 py-0.5 font-medium text-xs',
                  SEVERITY_BADGE[alert.severity]
                )}
              >
                {SEVERITY_LABELS[alert.severity]}
              </span>
              <span className='text-gray-500 text-xs'>{STATUS_LABELS[alert.status]}</span>
            </div>

            <div>
              <div className='mb-0.5 font-medium text-gray-500 text-xs uppercase'>
                {t('logs.alertDetailTitleLabel')}
              </div>
              <div className='font-medium text-gray-900 text-sm'>
                {translateAlertField(alert.title, alert.metadata, 'title', t)}
              </div>
            </div>

            {alert.description && (
              <div>
                <div className='mb-0.5 font-medium text-gray-500 text-xs uppercase'>
                  {t('logs.alertDetailDescLabel')}
                </div>
                <div className='text-gray-700 text-sm'>
                  {translateAlertField(alert.description, alert.metadata, 'description', t)}
                </div>
              </div>
            )}

            <div>
              <div className='mb-0.5 font-medium text-gray-500 text-xs uppercase'>
                {t('logs.alertDetailCategoryLabel')}
              </div>
              <div className='text-gray-900 text-sm'>
                {CATEGORY_LABELS[alert.category] ?? alert.category}
              </div>
            </div>

            {alert.employeeName && (
              <div>
                <div className='mb-0.5 font-medium text-gray-500 text-xs uppercase'>
                  {t('logs.alertDetailEmployeeLabel')}
                </div>
                <div className='text-gray-900 text-sm'>{alert.employeeName}</div>
              </div>
            )}

            {alert.taskExecutionId && (
              <div>
                <div className='mb-0.5 font-medium text-gray-500 text-xs uppercase'>
                  {t('logs.alertDetailTaskIdLabel')}
                </div>
                <div className='font-mono text-gray-700 text-sm'>{alert.taskExecutionId}</div>
              </div>
            )}

            {alert.errorMessage && (
              <div>
                <div className='mb-0.5 font-medium text-gray-500 text-xs uppercase'>
                  {t('logs.alertDetailErrorLabel')}
                </div>
                <div className='rounded bg-red-50 p-3 font-mono text-red-800 text-xs'>
                  {translateAlertField(alert.errorMessage, alert.metadata, 'error', t)}
                </div>
              </div>
            )}

            <div>
              <div className='mb-0.5 font-medium text-gray-500 text-xs uppercase'>
                {t('logs.alertDetailCreatedAtLabel')}
              </div>
              <div className='text-gray-900 text-sm'>
                {formatDateTimeI18n(alert.createdAt, locale as SupportedLocale)}
              </div>
            </div>

            {alert.resolvedBy && (
              <div>
                <div className='mb-0.5 font-medium text-gray-500 text-xs uppercase'>
                  {t('logs.alertDetailResolvedByLabel')}
                </div>
                <div className='text-gray-900 text-sm'>{alert.resolvedBy}</div>
              </div>
            )}

            {alert.resolvedAt && (
              <div>
                <div className='mb-0.5 font-medium text-gray-500 text-xs uppercase'>
                  {t('logs.alertDetailResolvedAtLabel')}
                </div>
                <div className='text-gray-900 text-sm'>{alert.resolvedAt}</div>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {alert.status !== 'resolved' && (
          <div className='flex gap-3 border-gray-200 border-t px-6 py-4'>
            {alert.status === 'open' && (
              <button
                type='button'
                disabled={updating}
                onClick={() => handleAction('acknowledged')}
                className='rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-50'
              >
                {t('logs.alertAcknowledge')}
              </button>
            )}
            <button
              type='button'
              disabled={updating}
              onClick={() => handleAction('resolved')}
              className='rounded-lg bg-blue-600 px-4 py-2 font-medium text-sm text-white hover:bg-blue-700 disabled:opacity-50'
            >
              {updating ? t('logs.alertProcessing') : t('logs.alertMarkResolved')}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

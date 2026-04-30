'use client'

import { useCallback, useEffect } from 'react'
import type { SupportedLocale } from '@/lib/core/utils/formatting'
import { formatDateTimeI18n } from '@/lib/core/utils/formatting'
import { translateAuditDescription } from '@/lib/i18n/translate-audit-description'
import type { AuditLogItem } from '@/app/api/audit/types'
import { useTranslation } from '@/hooks/use-translation'
import { useActionLabels, useResourceTypeLabels } from './use-log-labels'

interface LogDetailDrawerProps {
  log: AuditLogItem | null
  open: boolean
  onClose: () => void
}

export function LogDetailDrawer({ log, open, onClose }: LogDetailDrawerProps) {
  const { t, locale } = useTranslation()
  const ACTION_LABELS = useActionLabels()
  const RESOURCE_TYPE_LABELS = useResourceTypeLabels()

  const humanizeDescription = useCallback(
    (logItem: AuditLogItem): string => {
      const actionLabel = ACTION_LABELS[logItem.action]
      if (!actionLabel) {
        return translateAuditDescription(
          logItem.description ?? logItem.action ?? '',
          logItem.metadata,
          t
        )
      }
      if (logItem.resourceName) {
        return t('logs.descriptionWithName', { action: actionLabel, name: logItem.resourceName })
      }
      return t('logs.descriptionNoName', { action: actionLabel })
    },
    [ACTION_LABELS, t]
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open || !log) return null

  const metadata = log.metadata && Object.keys(log.metadata).length > 0 ? log.metadata : null
  const actorI18nKey =
    typeof log.metadata?.actorI18nKey === 'string' ? log.metadata.actorI18nKey : null
  const actorDisplay =
    log.actorName ?? (actorI18nKey ? t(`auditLog.${actorI18nKey}`) : null) ?? t('logs.systemActor')

  return (
    <>
      {/* Overlay */}
      <div className='fixed inset-0 z-40 bg-black/30' onClick={onClose} />

      {/* Drawer */}
      <div className='fixed top-0 right-0 z-50 flex h-full w-96 flex-col bg-white shadow-xl'>
        <div className='flex items-center justify-between border-gray-200 border-b px-6 py-4'>
          <h2 className='font-medium text-gray-900 text-lg'>{t('logs.detailTitle')}</h2>
          <button type='button' onClick={onClose} className='text-gray-400 hover:text-gray-600'>
            ✕
          </button>
        </div>

        <div className='flex-1 overflow-auto px-6 py-4'>
          <div className='space-y-4'>
            <Field
              label={t('logs.detailTime')}
              value={formatDateTimeI18n(log.createdAt, locale as SupportedLocale)}
            />
            <Field label={t('logs.detailOperator')} value={actorDisplay} />
            {log.actorEmail && <Field label={t('logs.detailEmail')} value={log.actorEmail} />}
            <Field
              label={t('logs.detailActionType')}
              value={ACTION_LABELS[log.action] ?? log.action}
            />
            <Field
              label={t('logs.detailResourceType')}
              value={RESOURCE_TYPE_LABELS[log.resourceType] ?? log.resourceType}
            />
            {log.resourceId && <Field label={t('logs.detailResourceId')} value={log.resourceId} />}
            {log.resourceName && (
              <Field label={t('logs.detailResourceName')} value={log.resourceName} />
            )}
            <Field label={t('logs.detailDescription')} value={humanizeDescription(log)} />
            {log.ipAddress && <Field label={t('logs.detailIpAddress')} value={log.ipAddress} />}
            {log.userAgent && <Field label='User Agent' value={log.userAgent} />}

            {metadata && (
              <div>
                <div className='mb-1 font-medium text-gray-500 text-xs uppercase'>
                  {t('logs.detailMetadata')}
                </div>
                <pre className='max-h-60 overflow-auto rounded bg-gray-50 p-3 font-mono text-gray-700 text-xs'>
                  {JSON.stringify(metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className='mb-0.5 font-medium text-gray-500 text-xs uppercase'>{label}</div>
      <div className='text-gray-900 text-sm'>{value}</div>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  FlaskConical,
  ShieldAlert,
  SkipForward,
  X,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { SupportedLocale } from '@/lib/core/utils/formatting'
import { formatCompactDateTimeI18n, formatDuration } from '@/lib/core/utils/formatting'
import { useTranslation } from '@/hooks/use-translation'
import type { SandboxRunInterceptedCall, SandboxRunListItem, SandboxRunNodeResult } from '../types'

const NODE_STATUS_ICON: Record<string, React.ReactNode> = {
  success: <CheckCircle2 className='h-4 w-4 text-green-500' />,
  error: <XCircle className='h-4 w-4 text-red-500' />,
  skipped: <SkipForward className='h-4 w-4 text-gray-400' />,
  intercepted: <ShieldAlert className='h-4 w-4 text-amber-500' />,
}

interface SandboxRunDetailDrawerProps {
  runId: string
  onClose: () => void
}

export function SandboxRunDetailDrawer({ runId, onClose }: SandboxRunDetailDrawerProps) {
  const { t, locale } = useTranslation()
  const [data, setData] = useState<SandboxRunListItem | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const BLOCK_TYPE_LABELS = useMemo<Record<string, string>>(
    () => ({
      digital_employee: t('tasks.nodeTypeEmployee'),
      human_employee: t('tasks.nodeTypeHuman'),
      human_confirm: t('tasks.nodeTypeHumanConfirm'),
    }),
    [t]
  )

  const fetchDetail = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/sandbox/runs/${runId}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result = await response.json()
      if (result.success) {
        setData(result.data)
        setError(null)
      } else {
        setError(result.error ?? t('tasks.sandboxDetailLoadFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.unknownError'))
    } finally {
      setIsLoading(false)
    }
  }, [runId, t])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const nodeResults: SandboxRunNodeResult[] =
    data && Array.isArray(data.nodeResults) ? data.nodeResults : []
  const interceptedCalls: SandboxRunInterceptedCall[] =
    data && Array.isArray(data.interceptedCalls) ? data.interceptedCalls : []

  return (
    <>
      <div className='fixed inset-0 z-40 bg-black/20' onClick={onClose} />
      <div className='fixed top-0 right-0 z-50 flex h-screen w-[520px] max-w-full flex-col bg-white shadow-xl'>
        <div className='flex items-center justify-between border-gray-200 border-b px-6 py-4'>
          <div className='flex items-center gap-3'>
            <FlaskConical className='h-5 w-5 text-amber-500' />
            <h2 className='font-semibold text-gray-900 text-lg'>{t('tasks.sandboxDetailTitle')}</h2>
            {data && (
              <Badge variant={STATUS_CONFIG[data.status]?.variant ?? 'secondary'}>
                {STATUS_CONFIG[data.status]?.label ?? data.status}
              </Badge>
            )}
          </div>
          <Button variant='ghost' size='icon' onClick={onClose}>
            <X className='h-5 w-5' />
          </Button>
        </div>

        <div className='flex-1 overflow-y-auto px-6 py-4'>
          {isLoading && (
            <div className='space-y-4'>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className='h-16 animate-pulse rounded-lg bg-gray-100' />
              ))}
            </div>
          )}

          {error && (
            <div className='flex flex-col items-center justify-center py-12'>
              <AlertTriangle className='h-8 w-8 text-red-400' />
              <p className='mt-2 text-red-600 text-sm'>{t('tasks.sandboxDetailLoadFailed')}</p>
              <Button variant='outline' size='sm' className='mt-3' onClick={fetchDetail}>
                {t('common.retry')}
              </Button>
            </div>
          )}

          {data && (
            <div className='space-y-6'>
              {/* Basic Info */}
              <section className='space-y-3'>
                <h3 className='font-medium text-gray-500 text-sm'>
                  {t('tasks.sandboxDetailBasicInfo')}
                </h3>
                <div className='grid grid-cols-2 gap-3'>
                  <InfoItem
                    label={t('tasks.sandboxDetailRunType')}
                    value={RUN_TYPE_LABELS[data.runType] ?? data.runType}
                  />
                  <InfoItem label={t('tasks.sandboxDetailRecordId')} value={data.id} />
                  <InfoItem
                    label={t('tasks.sandboxDetailCreatedAt')}
                    value={formatCompactDateTimeI18n(data.createdAt, locale as SupportedLocale)}
                  />
                  <InfoItem
                    label={t('tasks.sandboxDetailDuration')}
                    value={
                      data.totalDurationMs != null
                        ? (formatDuration(data.totalDurationMs) ?? '—')
                        : '—'
                    }
                    icon={<Clock className='h-3.5 w-3.5' />}
                  />
                  {data.totalTokensUsed != null && data.totalTokensUsed > 0 && (
                    <InfoItem
                      label={t('tasks.sandboxDetailTokenUsage')}
                      value={String(data.totalTokensUsed)}
                    />
                  )}
                </div>
              </section>

              {/* Error Message */}
              {data.errorMessage && (
                <section className='rounded-lg border border-red-200 bg-red-50 p-3'>
                  <p className='font-medium text-red-600 text-xs'>
                    {t('tasks.sandboxDetailErrorMessage')}
                  </p>
                  <p className='mt-1 text-red-800 text-sm'>{data.errorMessage}</p>
                </section>
              )}

              {/* Node Results */}
              <section>
                <h3 className='mb-3 font-medium text-gray-500 text-sm'>
                  {t('tasks.sandboxDetailNodeResults')} ({nodeResults.length})
                </h3>
                {nodeResults.length === 0 ? (
                  <p className='py-4 text-center text-gray-400 text-sm'>
                    {t('tasks.sandboxDetailNoNodeRecords')}
                  </p>
                ) : (
                  <div className='space-y-0'>
                    {nodeResults.map((node, idx) => (
                      <NodeResultItem
                        key={`${node.nodeId}-${idx}`}
                        node={node}
                        isLast={idx === nodeResults.length - 1}
                        blockTypeLabels={BLOCK_TYPE_LABELS}
                        simulatedLabel={t('tasks.sandboxDetailSimulated')}
                        interceptedLabel={t('tasks.sandboxDetailIntercepted')}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* Intercepted Calls */}
              {interceptedCalls.length > 0 && (
                <section>
                  <h3 className='mb-3 font-medium text-amber-600 text-sm'>
                    {t('tasks.sandboxDetailInterceptedCalls')} ({interceptedCalls.length})
                  </h3>
                  <div className='space-y-2'>
                    {interceptedCalls.map((call, idx) => (
                      <div
                        key={`${call.nodeId}-${idx}`}
                        className='rounded-lg border border-amber-200 bg-amber-50 p-3'
                      >
                        <div className='flex items-center gap-2'>
                          <ShieldAlert className='h-3.5 w-3.5 text-amber-500' />
                          <span className='font-medium text-amber-700 text-xs'>
                            {call.type} · {call.channel}
                          </span>
                          {call.target && (
                            <span className='text-amber-600 text-xs'>→ {call.target}</span>
                          )}
                        </div>
                        {call.content && (
                          <p className='mt-1 line-clamp-3 text-amber-800 text-xs'>{call.content}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Call Policy */}
              {data.policy && Object.keys(data.policy).length > 0 && (
                <section>
                  <h3 className='mb-2 font-medium text-gray-500 text-sm'>
                    {t('tasks.sandboxDetailCallPolicy')}
                  </h3>
                  <div className='flex flex-wrap gap-2'>
                    {Object.entries(data.policy).map(([key, allowed]) => (
                      <span
                        key={key}
                        className={`rounded-full px-2.5 py-0.5 font-medium text-xs ${
                          allowed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {key}:{' '}
                        {allowed ? t('tasks.sandboxDetailAllow') : t('tasks.sandboxDetailBlock')}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Trigger Data */}
              {data.triggerData && Object.keys(data.triggerData).length > 0 && (
                <section>
                  <h3 className='mb-2 font-medium text-gray-500 text-sm'>
                    {t('tasks.sandboxDetailTriggerData')}
                  </h3>
                  <pre className='overflow-x-auto rounded-lg bg-gray-50 p-3 font-mono text-gray-600 text-xs'>
                    {JSON.stringify(data.triggerData, null, 2)}
                  </pre>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function NodeResultItem({
  node,
  isLast,
  blockTypeLabels,
  simulatedLabel,
  interceptedLabel,
}: {
  node: SandboxRunNodeResult
  isLast: boolean
  blockTypeLabels: Record<string, string>
  simulatedLabel: string
  interceptedLabel: string
}) {
  const icon = NODE_STATUS_ICON[node.status] ?? <Circle className='h-4 w-4 text-gray-400' />
  const typeLabel = blockTypeLabels[node.blockType] ?? node.blockType

  return (
    <div className='flex gap-3'>
      <div className='flex flex-col items-center'>
        <div className='mt-1'>{icon}</div>
        {!isLast && <div className='mt-1 flex-1 border-gray-200 border-l' />}
      </div>
      <div className='flex-1 pb-4'>
        <div className='flex items-center gap-2'>
          <span className='font-medium text-gray-900 text-sm'>{node.nodeName}</span>
          <span className='rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500'>
            {typeLabel}
          </span>
          {node.simulated && (
            <span className='rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-600'>
              {simulatedLabel}
            </span>
          )}
          {node.intercepted && (
            <span className='rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-600'>
              {interceptedLabel}
            </span>
          )}
        </div>
        <div className='mt-0.5 text-gray-400 text-xs'>
          {node.durationMs != null && <span>{formatDuration(node.durationMs) ?? '—'}</span>}
        </div>
        {node.error && (
          <p className='mt-1 rounded bg-red-50 p-1.5 text-red-600 text-xs'>{node.error}</p>
        )}
      </div>
    </div>
  )
}

function InfoItem({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon?: React.ReactNode
}) {
  return (
    <div>
      <p className='text-gray-400 text-xs'>{label}</p>
      <p className='mt-0.5 flex items-center gap-1 break-all text-gray-900 text-sm'>
        {icon}
        {value}
      </p>
    </div>
  )
}

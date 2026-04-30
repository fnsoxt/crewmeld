'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Check, Copy, Loader2, StopCircle } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { copyToClipboard } from '@/lib/core/utils/clipboard'
import { cn } from '@/lib/core/utils/cn'
import { translateLogPayload } from '@/lib/i18n/log-payload'
import { useTranslation } from '@/hooks/use-translation'
import { useSopExecutionStore } from '@/stores/sop/execution-store'

const STATUS_KEYS: Record<string, { className: string; key: string }> = {
  pending: { className: 'bg-gray-100 text-gray-700', key: 'sops.execPending' },
  running: { className: 'bg-blue-100 text-blue-700', key: 'sops.execRunning' },
  paused_for_human: { className: 'bg-amber-100 text-amber-700', key: 'sops.execWaitingApproval' },
  completed: { className: 'bg-green-100 text-green-700', key: 'sops.execCompleted' },
  error: { className: 'bg-red-100 text-red-700', key: 'sops.execError' },
  failed: { className: 'bg-red-100 text-red-700', key: 'sops.execFailed' },
  timed_out: { className: 'bg-orange-100 text-orange-700', key: 'sops.execTimedOut' },
  cancelled: { className: 'bg-gray-100 text-gray-500', key: 'sops.execCancelled' },
}

const TERMINAL_STATUSES = new Set(['completed', 'error', 'failed', 'timed_out', 'cancelled'])

/** Node-level error + copy button */
function NodeErrorBlock({
  nodeId,
  nodeName,
  errorMessage,
  metadata,
}: {
  nodeId: string
  nodeName: string
  errorMessage: string
  metadata?: Record<string, unknown>
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const subMeta =
    typeof metadata?.errorI18nKey === 'string'
      ? {
          i18nKey: metadata.errorI18nKey,
          i18nParams: metadata.errorI18nParams as Record<string, string | number> | undefined,
        }
      : null
  const displayed = translateLogPayload(errorMessage, subMeta, t, 'errSop')

  const handleCopy = async () => {
    const text = t('sops.execDetailNodeFailed', { name: nodeName, id: nodeId, error: displayed })
    await copyToClipboard(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className='mt-2 flex items-start justify-between rounded border border-red-100 bg-red-50 px-3 py-2'>
      <pre className='flex-1 whitespace-pre-wrap break-all text-red-600 text-xs'>{displayed}</pre>
      <button
        onClick={handleCopy}
        className='ml-2 shrink-0 rounded p-1 text-red-400 hover:bg-red-100 hover:text-red-600'
        title={t('sops.execDetailCopyNodeError')}
        data-testid={`sop-execution:copy-node-error:${nodeId}`}
      >
        {copied ? <Check className='h-3.5 w-3.5' /> : <Copy className='h-3.5 w-3.5' />}
      </button>
    </div>
  )
}

export default function SopExecutionDetailPage() {
  const { id, execId } = useParams<{ id: string; execId: string }>()
  const router = useRouter()
  const { t } = useTranslation()

  const [detail, setDetail] = useState<{
    execution: Record<string, unknown>
    nodeExecutions: Array<Record<string, unknown>>
    pauseStates: Array<Record<string, unknown>>
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const status = useSopExecutionStore((s) => s.status)
  const events = useSopExecutionStore((s) => s.events)
  const nodeStates = useSopExecutionStore((s) => s.nodeStates)
  const isConnected = useSopExecutionStore((s) => s.isConnected)
  const startTracking = useSopExecutionStore((s) => s.startTracking)
  const stopTracking = useSopExecutionStore((s) => s.stopTracking)
  const resetStore = useSopExecutionStore((s) => s.reset)

  /** Load initial detail */
  useEffect(() => {
    async function load() {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/employee/sops/${id}/executions/${execId}`)
        if (!res.ok) throw new Error(t('sops.execDetailLoadFailed'))
        const json = await res.json()
        setDetail(json.data)

        const execStatus = json.data?.execution?.status as string
        if (execStatus && !TERMINAL_STATUSES.has(execStatus)) {
          startTracking(id, execId)
        }
      } finally {
        setIsLoading(false)
      }
    }
    load()
    return () => {
      stopTracking()
      resetStore()
    }
  }, [id, execId, startTracking, stopTracking, resetStore])

  /** Cancel execution */
  const handleCancel = useCallback(async () => {
    try {
      await fetch(`/api/employee/sops/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionId: execId }),
      })
    } catch {
      // handled by SSE status update
    }
  }, [id, execId])

  const [copied, setCopied] = useState(false)

  const displayStatus = status ?? (detail?.execution?.status as string) ?? 'pending'
  const cfg = STATUS_KEYS[displayStatus] ?? STATUS_KEYS.pending
  const isTerminal = TERMINAL_STATUSES.has(displayStatus)
  const errorMessage = detail?.execution?.errorMessage as string | undefined
  const executionMeta = detail?.execution?.metadata as Record<string, unknown> | undefined
  const errorSubMeta =
    typeof executionMeta?.errorI18nKey === 'string'
      ? {
          i18nKey: executionMeta.errorI18nKey,
          i18nParams: executionMeta.errorI18nParams as Record<string, string | number> | undefined,
        }
      : null
  const displayedError = errorMessage
    ? translateLogPayload(errorMessage, errorSubMeta, t, 'errSop')
    : undefined

  const handleCopyError = useCallback(async () => {
    if (!displayedError) return
    const text = t('sops.execDetailSopFailed', {
      id: execId,
      status: displayStatus,
      error: displayedError,
    })
    await copyToClipboard(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [displayedError, execId, displayStatus, t])

  if (isLoading) {
    return (
      <div className='flex h-[60vh] items-center justify-center'>
        <Loader2 className='h-8 w-8 animate-spin text-gray-400' />
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => router.push(`/sops/${id}/executions`)}
        className='mb-4 flex items-center gap-1 text-gray-500 text-sm hover:text-gray-900'
      >
        <ArrowLeft className='h-4 w-4' />
        {t('sops.execDetailBack')}
      </button>

      <div className='mb-6 flex items-center justify-between'>
        <div className='flex items-center gap-3'>
          <h1 className='font-bold text-gray-900 text-xl'>{t('sops.execDetailTitle')}</h1>
          <Badge variant='outline' className={cn('text-xs', cfg.className)}>
            {t(cfg.key as Parameters<typeof t>[0])}
          </Badge>
          {isConnected && (
            <span className='flex items-center gap-1 text-green-600 text-xs'>
              <span className='h-1.5 w-1.5 animate-pulse rounded-full bg-green-500' />
              {t('sops.execDetailLive')}
            </span>
          )}
        </div>
        {!isTerminal && (
          <Button
            variant='outline'
            size='sm'
            onClick={handleCancel}
            data-testid='sop-execution:cancel'
          >
            <StopCircle className='mr-1.5 h-4 w-4' />
            {t('sops.execDetailCancel')}
          </Button>
        )}
      </div>

      {/* Error Message */}
      {displayedError &&
        (displayStatus === 'error' ||
          displayStatus === 'failed' ||
          displayStatus === 'timed_out') && (
          <div className='mb-6 rounded-lg border border-red-200 bg-red-50 p-4'>
            <div className='mb-2 flex items-center justify-between'>
              <h2 className='font-semibold text-red-700 text-sm'>
                {t('sops.execDetailErrorTitle')}
              </h2>
              <Button
                variant='ghost'
                size='sm'
                className='h-7 gap-1.5 text-red-600 text-xs hover:text-red-800'
                onClick={handleCopyError}
                data-testid='sop-execution:copy-error'
              >
                {copied ? (
                  <>
                    <Check className='h-3.5 w-3.5' />
                    {t('sops.execDetailCopied')}
                  </>
                ) : (
                  <>
                    <Copy className='h-3.5 w-3.5' />
                    {t('sops.execDetailCopyError')}
                  </>
                )}
              </Button>
            </div>
            <pre className='whitespace-pre-wrap break-all text-red-600 text-xs'>
              {displayedError}
            </pre>
          </div>
        )}

      {/* Node Execution States */}
      <div className='mb-6'>
        <h2 className='mb-3 font-semibold text-gray-700 text-sm'>
          {t('sops.execDetailNodeStatus')}
        </h2>
        {detail?.nodeExecutions && detail.nodeExecutions.length > 0 ? (
          <div className='space-y-2'>
            {detail.nodeExecutions.map((ne) => {
              const neId = ne.nodeId as string
              const liveState = nodeStates.get(neId)
              const neStatus = liveState?.status ?? (ne.status as string)
              const neCfg = STATUS_KEYS[neStatus] ?? STATUS_KEYS.pending
              const neError = ne.errorMessage as string | undefined
              const neMeta = ne.metadata as Record<string, unknown> | undefined
              return (
                <div
                  key={ne.id as string}
                  className='rounded-lg border border-gray-200 bg-white px-4 py-2.5'
                >
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <Badge variant='outline' className={cn('text-[10px]', neCfg.className)}>
                        {t(neCfg.key as Parameters<typeof t>[0])}
                      </Badge>
                      <span className='text-gray-700 text-sm'>
                        {(ne.nodeName as string) ?? neId}
                      </span>
                    </div>
                    <span className='text-gray-400 text-xs'>
                      {ne.startedAt ? new Date(ne.startedAt as string).toLocaleString() : '-'}
                    </span>
                  </div>
                  {neError && neStatus === 'error' && (
                    <NodeErrorBlock
                      nodeId={neId}
                      nodeName={ne.nodeName as string}
                      errorMessage={neError}
                      metadata={neMeta}
                    />
                  )}
                </div>
              )
            })}
          </div>
        ) : nodeStates.size > 0 ? (
          <div className='space-y-2'>
            {Array.from(nodeStates.values()).map((ns) => {
              const nsCfg = STATUS_KEYS[ns.status] ?? STATUS_KEYS.pending
              return (
                <div
                  key={ns.nodeId}
                  className='flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2.5'
                >
                  <div className='flex items-center gap-2'>
                    <Badge variant='outline' className={cn('text-[10px]', nsCfg.className)}>
                      {t(nsCfg.key as Parameters<typeof t>[0])}
                    </Badge>
                    <span className='text-gray-700 text-sm'>{ns.nodeId}</span>
                  </div>
                  <span className='text-gray-400 text-xs'>
                    {ns.startedAt ? new Date(ns.startedAt).toLocaleString() : '-'}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className='text-gray-400 text-sm'>{t('sops.execDetailNoNodeData')}</p>
        )}
      </div>

      {/* Pause States (approvals) */}
      {detail?.pauseStates && detail.pauseStates.length > 0 && (
        <div className='mb-6'>
          <h2 className='mb-3 font-semibold text-gray-700 text-sm'>
            {t('sops.execDetailApprovalRecords')}
          </h2>
          <div className='space-y-2'>
            {detail.pauseStates.map((ps) => (
              <div
                key={ps.id as string}
                className='rounded-lg border border-gray-200 bg-white px-4 py-3'
              >
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <Badge
                      variant='outline'
                      className={cn(
                        'text-[10px]',
                        ps.decision === 'approved'
                          ? 'bg-green-100 text-green-700'
                          : ps.decision === 'rejected'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                      )}
                    >
                      {ps.decision === 'approved'
                        ? t('sops.execDetailApproved')
                        : ps.decision === 'rejected'
                          ? t('sops.execDetailRejected')
                          : t('sops.execDetailPendingApproval')}
                    </Badge>
                    <span className='text-gray-700 text-sm'>{ps.nodeId as string}</span>
                  </div>
                  <span className='text-gray-400 text-xs'>
                    {ps.decidedAt
                      ? new Date(ps.decidedAt as string).toLocaleString()
                      : t('sops.execDetailWaiting')}
                  </span>
                </div>
                {Boolean(ps.decidedBy || ps.comment) && (
                  <div className='mt-2 border-gray-100 border-t pt-2'>
                    {Boolean(ps.decidedBy) && (
                      <p className='text-gray-500 text-xs'>
                        {t('sops.execDetailDecider', { name: String(ps.decidedBy) })}
                      </p>
                    )}
                    {Boolean(ps.comment) && (
                      <p className='mt-1 text-gray-600 text-xs'>
                        {t('sops.execDetailComment', { comment: String(ps.comment) })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event Log */}
      {events.length > 0 && (
        <div>
          <h2 className='mb-3 font-semibold text-gray-700 text-sm'>
            {t('sops.execDetailEventLog', { count: events.length })}
          </h2>
          <div className='max-h-64 space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3'>
            {events.map((evt, i) => (
              <div key={i} className='flex items-center gap-2 text-xs'>
                <span className='shrink-0 font-mono text-gray-400'>
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </span>
                <span className='font-medium text-gray-600'>{evt.type}</span>
                {evt.nodeId && <span className='text-gray-400'>{evt.nodeId}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className='mt-4 text-gray-400 text-xs'>{t('sops.execDetailId', { id: execId })}</div>
    </div>
  )
}

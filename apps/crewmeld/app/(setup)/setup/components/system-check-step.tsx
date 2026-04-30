'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, MinusCircle } from 'lucide-react'
import { useTranslation } from '@/hooks/use-translation'

interface ComponentStatus {
  status: 'ok' | 'error' | 'skipped'
  latencyMs: number
  error?: string
}

interface ReadyData {
  status: string
  version: string
  components: Record<string, ComponentStatus>
}

function StatusIcon({ status }: { status: 'ok' | 'error' | 'skipped' | 'loading' }) {
  switch (status) {
    case 'ok':
      return <CheckCircle2 className='h-5 w-5 text-green-500' />
    case 'error':
      return <AlertCircle className='h-5 w-5 text-red-500' />
    case 'skipped':
      return <MinusCircle className='h-5 w-5 text-gray-400' />
    case 'loading':
      return <Loader2 className='h-5 w-5 animate-spin text-gray-400' />
  }
}

export function SystemCheckStep() {
  const { t } = useTranslation()
  const [readyData, setReadyData] = useState<ReadyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/api/ready')
        const data = await res.json()
        setReadyData(data)
      } catch {
        setFetchError(t('setup.fetchError'))
      } finally {
        setLoading(false)
      }
    }
    check()
  }, [])

  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className='space-y-4'>
      <div>
        <h2 className='font-semibold text-gray-900 text-lg'>{t('setup.checkTitle')}</h2>
        <p className='mt-1 text-gray-500 text-sm'>{t('setup.checkSubtitle')}</p>
      </div>

      {fetchError && (
        <div className='rounded-md bg-red-50 p-3 text-red-700 text-sm'>{fetchError}</div>
      )}

      <div className='space-y-2' data-testid='setup-form:system-check-list'>
        {loading ? (
          <>
            <CheckRow label={t('setup.checkDatabase')} status='loading' t={t} />
            <CheckRow label='Redis' status='loading' t={t} />
            <CheckRow label='Migrations' status='loading' t={t} />
          </>
        ) : readyData ? (
          Object.entries(readyData.components).map(([key, comp]) => (
            <CheckRow
              key={key}
              label={
                key === 'database' ? t('setup.checkDatabase') : key === 'redis' ? 'Redis' : key
              }
              status={comp.status}
              latencyMs={comp.latencyMs}
              error={comp.error}
              t={t}
            />
          ))
        ) : null}
      </div>

      <div className='rounded-md bg-gray-50 p-3 text-gray-600 text-sm'>
        <p>
          <span className='font-medium'>{t('setup.checkAccessUrl')}</span>
          {appUrl || t('setup.checkNotDetected')}
        </p>
      </div>
    </div>
  )
}

function CheckRow({
  label,
  status,
  latencyMs,
  error,
  t,
}: {
  label: string
  status: 'ok' | 'error' | 'skipped' | 'loading'
  latencyMs?: number
  error?: string
  t: (key: string) => string
}) {
  return (
    <div className='flex items-center justify-between rounded-md border px-3 py-2'>
      <div className='flex items-center gap-2'>
        <StatusIcon status={status} />
        <span className='font-medium text-gray-700 text-sm'>{label}</span>
      </div>
      <div className='text-gray-400 text-xs'>
        {status === 'loading' && t('setup.checking')}
        {status === 'ok' && latencyMs !== undefined && `${latencyMs}ms`}
        {status === 'skipped' && t('setup.checkSkip')}
        {status === 'error' && (
          <span className='text-red-500'>{error || t('setup.checkError')}</span>
        )}
      </div>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/core/utils/cn'
import { useTranslation } from '@/hooks/use-translation'

interface ExecutionListItem {
  id: string
  status: string
  startNodeId: string | null
  currentNodeId: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

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

export default function SopExecutionsPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { t } = useTranslation()
  const [executions, setExecutions] = useState<ExecutionListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const PAGE_SIZE = 20

  const fetchExecutions = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
      if (statusFilter !== 'all') params.append('status', statusFilter)

      const res = await fetch(`/api/employee/sops/${id}/executions?${params}`)
      if (!res.ok) throw new Error(t('sops.execFetchFailed'))
      const json = await res.json()
      setExecutions(json.data?.items ?? [])
      setTotal(json.data?.total ?? 0)
    } finally {
      setIsLoading(false)
    }
  }, [id, page, statusFilter, t])

  useEffect(() => {
    fetchExecutions()
  }, [fetchExecutions])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      <div className='mb-6'>
        <button
          onClick={() => router.push(`/sops/${id}/edit`)}
          className='mb-3 flex items-center gap-1 text-gray-500 text-sm hover:text-gray-900'
        >
          <ArrowLeft className='h-4 w-4' />
          {t('sops.execBackToEditor')}
        </button>
        <div className='flex items-center justify-between'>
          <h1 className='font-bold text-2xl text-gray-900'>{t('sops.execTitle')}</h1>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v)
              setPage(1)
            }}
          >
            <SelectTrigger className='w-[140px]'>
              <SelectValue placeholder={t('sops.execAllStatus')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{t('sops.execAllStatus')}</SelectItem>
              <SelectItem value='running'>{t('sops.execRunning')}</SelectItem>
              <SelectItem value='paused_for_human'>{t('sops.execWaitingApproval')}</SelectItem>
              <SelectItem value='completed'>{t('sops.execCompleted')}</SelectItem>
              <SelectItem value='error'>{t('sops.execError')}</SelectItem>
              <SelectItem value='timed_out'>{t('sops.execTimedOut')}</SelectItem>
              <SelectItem value='cancelled'>{t('sops.execCancelled')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className='space-y-3'>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className='h-16 animate-pulse rounded-lg bg-gray-200' />
          ))}
        </div>
      ) : executions.length === 0 ? (
        <div className='flex min-h-[40vh] flex-col items-center justify-center text-gray-500'>
          {t('sops.execEmpty')}
        </div>
      ) : (
        <>
          <div className='space-y-2'>
            {executions.map((exec) => {
              const cfg = STATUS_KEYS[exec.status] ?? STATUS_KEYS.pending
              return (
                <Link
                  key={exec.id}
                  href={`/sops/${id}/executions/${exec.id}`}
                  className='flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 transition-colors hover:bg-gray-50'
                  data-testid={`sop-executions:item:${exec.id}`}
                >
                  <div className='flex items-center gap-3'>
                    <Badge variant='outline' className={cn('text-xs', cfg.className)}>
                      {t(cfg.key as Parameters<typeof t>[0])}
                    </Badge>
                    <span className='font-medium text-gray-700 text-sm'>
                      {exec.id.slice(0, 12)}...
                    </span>
                  </div>
                  <div className='text-gray-400 text-xs'>
                    {new Date(exec.createdAt).toLocaleString()}
                  </div>
                </Link>
              )
            })}
          </div>

          {totalPages > 1 && (
            <div className='mt-4 flex items-center justify-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t('sops.execPrevPage')}
              </Button>
              <span className='text-gray-500 text-xs'>
                {page} / {totalPages}
              </span>
              <Button
                variant='outline'
                size='sm'
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('sops.execNextPage')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

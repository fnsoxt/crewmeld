'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/core/utils/cn'
import type { SupportedLocale } from '@/lib/core/utils/formatting'
import { formatDateTimeI18n } from '@/lib/core/utils/formatting'
import { translateAlertField } from '@/lib/i18n/translate-alert-field'
import type { AnomalyAlertItem } from '@/app/api/audit/types'
import { useTranslation } from '@/hooks/use-translation'
import { AlertDetailDrawer } from './alert-detail-drawer'

const PAGE_SIZE = 50

export function AlertsTab() {
  const { t, locale } = useTranslation()

  const SEVERITY_CONFIG = useMemo(
    () =>
      ({
        critical: {
          label: t('logs.alertSeverityCritical'),
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-800',
          badge: 'bg-red-100 text-red-800',
        },
        warning: {
          label: t('logs.alertSeverityWarning'),
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          text: 'text-yellow-800',
          badge: 'bg-yellow-100 text-yellow-800',
        },
        info: {
          label: t('logs.alertSeverityInfo'),
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          text: 'text-blue-800',
          badge: 'bg-blue-100 text-blue-800',
        },
      }) as const,
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

  const STATUS_OPTIONS = useMemo(
    () => [
      { value: '', label: t('logs.alertFilterAllStatus') },
      { value: 'open', label: t('logs.alertStatusOpen') },
      { value: 'acknowledged', label: t('logs.alertStatusAcknowledged') },
      { value: 'resolved', label: t('logs.alertStatusResolved') },
    ],
    [t]
  )

  const SEVERITY_OPTIONS = useMemo(
    () => [
      { value: '', label: t('logs.alertFilterAllSeverity') },
      { value: 'critical', label: t('logs.alertSeverityCritical') },
      { value: 'warning', label: t('logs.alertSeverityWarning') },
      { value: 'info', label: t('logs.alertSeverityInfo') },
    ],
    [t]
  )

  const [alerts, setAlerts] = useState<AnomalyAlertItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)

  const [severityFilter, setSeverityFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('open')

  const [stats, setStats] = useState({ critical: 0, warning: 0, info: 0 })

  const [selectedAlert, setSelectedAlert] = useState<AnomalyAlertItem | null>(null)

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(offset))

      if (severityFilter) params.set('severity', severityFilter)
      if (statusFilter) params.set('status', statusFilter)

      const res = await fetch(`/api/audit/alerts?${params.toString()}`)
      const json = await res.json()

      if (!json.success) {
        setError(json.error ?? t('logs.loadFailed'))
        return
      }

      setAlerts(json.data)
      setTotal(json.pagination.total)
    } catch {
      setError(t('logs.loadFailedRetry'))
    } finally {
      setLoading(false)
    }
  }, [offset, severityFilter, statusFilter, t])

  const fetchStats = useCallback(async () => {
    try {
      const results = await Promise.all(
        (['critical', 'warning', 'info'] as const).map(async (sev) => {
          const res = await fetch(`/api/audit/alerts?severity=${sev}&status=open&limit=1`)
          const json = await res.json()
          return { severity: sev, count: json.success ? json.pagination.total : 0 }
        })
      )
      setStats({
        critical: results.find((r) => r.severity === 'critical')?.count ?? 0,
        warning: results.find((r) => r.severity === 'warning')?.count ?? 0,
        info: results.find((r) => r.severity === 'info')?.count ?? 0,
      })
    } catch {
      /* stats are non-critical */
    }
  }, [])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  useEffect(() => {
    setOffset(0)
  }, [severityFilter, statusFilter])

  const handleStatusChange = useCallback(
    async (id: string, newStatus: 'acknowledged' | 'resolved') => {
      try {
        const res = await fetch(`/api/audit/alerts/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        })
        const json = await res.json()
        if (json.success) {
          setSelectedAlert(null)
          fetchAlerts()
          fetchStats()
        }
      } catch {
        /* handled by drawer */
      }
    },
    [fetchAlerts, fetchStats]
  )

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div>
      {/* Stats cards */}
      <div className='mb-4 grid grid-cols-3 gap-4'>
        {(['critical', 'warning', 'info'] as const).map((sev) => {
          const config = SEVERITY_CONFIG[sev]
          return (
            <button
              key={sev}
              type='button'
              onClick={() => {
                setSeverityFilter(severityFilter === sev ? '' : sev)
                setStatusFilter('open')
              }}
              className={cn(
                'rounded-lg border p-4 text-left transition-shadow hover:shadow-md',
                config.bg,
                config.border,
                severityFilter === sev && 'ring-2 ring-blue-500 ring-offset-1'
              )}
            >
              <div className={cn('font-medium text-sm', config.text)}>{config.label}</div>
              <div className={cn('mt-1 font-bold text-2xl', config.text)}>{stats[sev]}</div>
              <div className='mt-1 text-gray-500 text-xs'>{t('logs.alertStatusOpen')}</div>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className='mb-4 flex gap-3'>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className='rounded-md border border-gray-300 bg-white px-3 py-2 text-sm'
        >
          {SEVERITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className='rounded-md border border-gray-300 bg-white px-3 py-2 text-sm'
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Error state */}
      {error && (
        <div className='mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm'>
          {error}
          <button
            type='button'
            onClick={fetchAlerts}
            className='ml-3 font-medium text-red-800 underline'
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* Alert list */}
      {loading ? (
        <div className='space-y-3'>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className='h-24 animate-pulse rounded-lg border border-gray-200 bg-gray-100'
            />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className='rounded-lg border border-gray-200 bg-white py-12 text-center text-gray-400 text-sm'>
          <div className='text-3xl text-green-500'>✓</div>
          <div className='mt-2'>{t('logs.alertNoAlerts')}</div>
        </div>
      ) : (
        <div className='space-y-3'>
          {alerts.map((alert) => {
            const sevConfig = SEVERITY_CONFIG[alert.severity]
            return (
              <button
                key={alert.id}
                type='button'
                onClick={() => setSelectedAlert(alert)}
                className={cn(
                  'w-full rounded-lg border bg-white p-4 text-left transition-shadow hover:shadow-md',
                  alert.status === 'resolved' && 'opacity-60'
                )}
              >
                <div className='flex items-center gap-3'>
                  <span className={cn('rounded px-2 py-0.5 font-medium text-xs', sevConfig.badge)}>
                    {sevConfig.label}
                  </span>
                  <span
                    className={cn(
                      'font-medium text-gray-900 text-sm',
                      alert.status === 'resolved' && 'text-gray-400 line-through'
                    )}
                  >
                    {translateAlertField(alert.title, alert.metadata, 'title', t)}
                  </span>
                  <span className='ml-auto text-gray-400 text-xs'>
                    {STATUS_LABELS[alert.status]}
                  </span>
                </div>
                <div className='mt-2 flex gap-4 text-gray-500 text-xs'>
                  {alert.employeeName && (
                    <span>
                      {t('logs.alertEmployee')}
                      {alert.employeeName}
                    </span>
                  )}
                  <span>
                    {t('logs.alertCategory')}
                    {CATEGORY_LABELS[alert.category] ?? alert.category}
                  </span>
                  <span>{formatDateTimeI18n(alert.createdAt, locale as SupportedLocale)}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className='mt-4 flex items-center justify-between text-gray-600 text-sm'>
          <span>
            {t('logs.paginationTotal', {
              total: String(total),
              page: String(currentPage),
              totalPages: String(totalPages),
            })}
          </span>
          <div className='flex gap-2'>
            <button
              type='button'
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className='rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50'
            >
              {t('logs.prevPage')}
            </button>
            <button
              type='button'
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className='rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50'
            >
              {t('logs.nextPage')}
            </button>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      <AlertDetailDrawer
        alert={selectedAlert}
        open={selectedAlert !== null}
        onClose={() => setSelectedAlert(null)}
        onStatusChange={handleStatusChange}
      />
    </div>
  )
}

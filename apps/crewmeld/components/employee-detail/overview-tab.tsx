'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  BookOpen,
  Brain,
  CheckCircle,
  Clock,
  FileText,
  XCircle,
  Zap,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SupportedLocale } from '@/lib/core/utils/formatting'
import { formatCompactDateTimeI18n, formatDuration } from '@/lib/core/utils/formatting'
import { useTranslation } from '@/hooks/use-translation'
import { translateLogMessage } from './translate-log'

interface EmployeeStats {
  period: string
  tasksCompleted: number
  successRate: number
  avgDuration: number
  pendingReview: number
  errorCount: number
  totalCost: number
}

interface RecentLog {
  id: string
  timestamp: string
  type: string
  message: string
  metadata?: Record<string, unknown>
}

const PERIOD_KEYS = [
  { value: 'month', key: 'employees.periodMonth' },
  { value: 'week', key: 'employees.periodWeek' },
  { value: 'day', key: 'employees.periodDay' },
] as const

const LOG_TYPE_KEYS: Record<string, string> = {
  action: 'employees.logTypeAction',
  decision: 'employees.logTypeDecision',
  tool_call: 'employees.logTypeToolCall',
  llm_call: 'employees.logTypeLlmCall',
  error: 'employees.logTypeError',
}

const TYPE_COLORS: Record<string, string> = {
  action: 'bg-blue-100 text-blue-700',
  decision: 'bg-purple-100 text-purple-700',
  tool_call: 'bg-cyan-100 text-cyan-700',
  llm_call: 'bg-indigo-100 text-indigo-700',
  error: 'bg-red-100 text-red-700',
}

interface OverviewTabProps {
  employeeId: string
  templateName?: string | null
  knowledgeBindingCount?: number
  boundModelName?: string | null
}

export function OverviewTab({
  employeeId,
  templateName,
  knowledgeBindingCount,
  boundModelName,
}: OverviewTabProps) {
  const { t, locale } = useTranslation()
  const [period, setPeriod] = useState('month')
  const [stats, setStats] = useState<EmployeeStats | null>(null)
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [statsRes, tasksRes] = await Promise.all([
        fetch(`/api/employee/employees/${employeeId}/stats?period=${period}`),
        fetch(`/api/employee/employees/${employeeId}/logs?limit=10&type=action`),
      ])

      if (statsRes.ok) {
        const statsJson = await statsRes.json()
        setStats(statsJson.data)
      }

      if (tasksRes.ok) {
        const tasksJson = await tasksRes.json()
        setRecentLogs(tasksJson.data ?? [])
      }
    } finally {
      setIsLoading(false)
    }
  }, [employeeId, period])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (isLoading && !stats) {
    return (
      <div className='space-y-4'>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className='h-28 animate-pulse rounded-lg bg-gray-100' />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <h3 className='font-medium text-gray-900 text-lg'>{t('employees.overviewTitle')}</h3>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className='w-28'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_KEYS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {t(opt.key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {stats && (
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          <StatCard
            icon={<CheckCircle className='h-5 w-5 text-green-500' />}
            title={t('employees.tasksCompleted')}
            value={t('employees.tasksUnit', { count: stats.tasksCompleted.toLocaleString() })}
          />
          <StatCard
            icon={<Zap className='h-5 w-5 text-blue-500' />}
            title={t('employees.successRate')}
            value={`${stats.successRate}%`}
          />
          <StatCard
            icon={<Clock className='h-5 w-5 text-gray-500' />}
            title={t('employees.avgDuration')}
            value={formatDuration(stats.avgDuration * 1000) ?? '—'}
          />
          <StatCard
            icon={<AlertTriangle className='h-5 w-5 text-yellow-500' />}
            title={t('employees.pendingReview')}
            value={t('employees.tasksUnit', { count: stats.pendingReview })}
            alert={stats.pendingReview > 0}
          />
          <StatCard
            icon={<XCircle className='h-5 w-5 text-red-500' />}
            title={t('employees.errorCount')}
            value={t('employees.tasksUnit', { count: stats.errorCount })}
            alert={stats.errorCount > 0}
          />
        </div>
      )}

      <div>
        <h3 className='mb-3 font-medium text-gray-900 text-lg'>
          {t('employees.assetBindingTitle')}
        </h3>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {templateName && (
            <StatCard
              icon={<FileText className='h-5 w-5 text-violet-500' />}
              title={t('employees.sourceTemplate')}
              value={templateName}
            />
          )}
          <StatCard
            icon={<BookOpen className='h-5 w-5 text-amber-500' />}
            title={t('employees.knowledgeBinding')}
            value={t('employees.knowledgeCount', { count: knowledgeBindingCount ?? 0 })}
          />
          <StatCard
            icon={<Brain className='h-5 w-5 text-purple-500' />}
            title={t('employees.boundModel')}
            value={boundModelName ?? t('employees.notBound')}
          />
        </div>
      </div>

      <div>
        <h3 className='mb-3 font-medium text-gray-900 text-lg'>{t('employees.recentActivity')}</h3>
        {recentLogs.length === 0 ? (
          <p className='py-8 text-center text-gray-400 text-sm'>{t('employees.noActivity')}</p>
        ) : (
          <div className='space-y-2'>
            {recentLogs.map((log) => (
              <div
                key={log.id}
                className='flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3'
              >
                <span className='shrink-0 text-gray-400 text-xs'>
                  {formatCompactDateTimeI18n(log.timestamp, locale as SupportedLocale)}
                </span>
                <span
                  className={`inline-block shrink-0 rounded px-2 py-0.5 font-medium text-xs ${
                    TYPE_COLORS[log.type] ?? 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {LOG_TYPE_KEYS[log.type]
                    ? t(LOG_TYPE_KEYS[log.type] as Parameters<typeof t>[0])
                    : log.type}
                </span>
                <span className='flex-1 text-gray-700 text-sm'>{translateLogMessage(log, t)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface StatCardProps {
  icon: React.ReactNode
  title: string
  value: string
  alert?: boolean
}

function StatCard({ icon, title, value, alert }: StatCardProps) {
  return (
    <Card className={alert ? 'border-yellow-300 bg-yellow-50' : ''}>
      <CardContent className='flex items-center gap-3 p-4'>
        <div className='shrink-0'>{icon}</div>
        <div>
          <p className='text-gray-500 text-sm'>{title}</p>
          <p className='font-semibold text-gray-900 text-xl'>{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

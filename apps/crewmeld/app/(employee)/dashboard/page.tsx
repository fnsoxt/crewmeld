'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { CircleDot, GitBranch, MessageSquare } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AssetOverview } from '@/components/dashboard/asset-overview'
import { MetricCard } from '@/components/dashboard/metric-card'
import { MiniTrendChart } from '@/components/dashboard/mini-trend-chart'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { type TranslationKey, useTranslation } from '@/hooks/use-translation'
import { SystemStatusCard } from './components/system-status-card'

interface CoreMetrics {
  totalEmployees: number
  activeEmployees: number
  standbyEmployees: number
  pausedEmployees: number
  errorEmployees: number
  monthlyTasks: number
  monthlyTasksGrowth: number
  successRate: number
  successRateChange: number
  pendingItems: number
  hitlWaitingCount: number
  sopWaitingCount: number
}

interface TrendPoint {
  date: string
  taskCount: number
}

interface RankingItem {
  employeeId: string
  employeeName: string
  avatar: string | null
  status: string
  todayTasks: number
  successRate: number
}

interface AssetOverviewData {
  tools: { total: number; deployed: number; boundCount: number }
  knowledgeBases: { total: number; boundCount: number }
  connections: { total: number; connectedCount: number }
}

interface SopOverview {
  definitions: number
  monthlyExecutions: number
  monthlyCompleted: number
  monthlyFailed: number
  monthlyRunning: number
  totalExecutions: number
  totalCompleted: number
  pendingApprovals: number
}

interface ConvOverview {
  monthlyConversations: number
  monthlyMessages: number
  activeConversations: number
  byChannel: Record<string, number>
}

interface DashboardData {
  coreMetrics: CoreMetrics
  assetOverview?: AssetOverviewData
  sopOverview?: SopOverview
  convOverview?: ConvOverview
  trendData: TrendPoint[]
  employeeRanking: RankingItem[]
}

type PageState = 'loading' | 'empty' | 'ready' | 'error'

function LoadingSkeleton() {
  return (
    <div className='space-y-6'>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className='h-28 animate-pulse rounded-xl bg-gray-200' />
        ))}
      </div>
      <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
        <div className='h-48 animate-pulse rounded-xl bg-gray-200' />
        <div className='h-48 animate-pulse rounded-xl bg-gray-200' />
      </div>
      <div className='h-48 animate-pulse rounded-xl bg-gray-200' />
    </div>
  )
}

function EmptyState() {
  const { t } = useTranslation()
  return (
    <div className='flex min-h-[60vh] flex-col items-center justify-center'>
      <div className='text-center'>
        <h3 className='mb-2 font-semibold text-gray-900 text-xl'>{t('dashboard.noEmployees')}</h3>
        <p className='mb-6 text-gray-500 text-sm'>{t('dashboard.noEmployeesHint')}</p>
      </div>
    </div>
  )
}

function formatNumber(n: number, locale?: string, largeSuffix?: string): string {
  if (locale === 'zh-CN') {
    if (n >= 10000) return `${(n / 10000).toFixed(1)}${largeSuffix ?? '万'}`
  } else {
    if (n >= 10000) return `${(n / 10000).toFixed(1)}${largeSuffix ?? 'K'}`
  }
  if (n >= 1000) return n.toLocaleString()
  return String(n)
}

const STATUS_DOT: Record<string, string> = {
  active: 'text-green-500',
  standby: 'text-yellow-500',
  paused: 'text-gray-400',
  error: 'text-red-500',
}

const CHANNEL_COLORS: Record<string, string> = {
  Web: 'bg-blue-100 text-blue-700',
  WeCom: 'bg-green-100 text-green-700',
  DingTalk: 'bg-indigo-100 text-indigo-700',
  Feishu: 'bg-purple-100 text-purple-700',
  API: 'bg-gray-100 text-gray-700',
  'Official Account': 'bg-emerald-100 text-emerald-700',
}

/** Map API-returned Chinese channel names to stable keys */
const CHANNEL_KEY_MAP: Record<string, string> = {
  企业微信: 'WeCom',
  钉钉: 'DingTalk',
  飞书: 'Feishu',
  公众号: 'Official Account',
  Web: 'Web',
  API: 'API',
}

/** Map stable keys to translation keys */
const CHANNEL_I18N_KEY: Record<string, string> = {
  Web: 'dashboard.channelWeb',
  WeCom: 'dashboard.channelWecom',
  DingTalk: 'dashboard.channelDingtalk',
  Feishu: 'dashboard.channelFeishu',
  API: 'dashboard.channelApi',
  'Official Account': 'dashboard.channelWxoa',
}

const MemoizedTrendChart = memo(function MemoizedTrendChart({
  trendData,
}: {
  trendData: TrendPoint[]
}) {
  const chartData = useMemo(
    () => trendData.map((d) => ({ date: d.date, value: d.taskCount })),
    [trendData]
  )
  return <MiniTrendChart data={chartData} height={120} />
})

export default function DashboardPage() {
  const router = useRouter()
  const { t, locale } = useTranslation()
  const [pageState, setPageState] = useState<PageState>('loading')
  const [data, setData] = useState<DashboardData | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/stats/overview')
      if (res.status === 401) {
        router.push('/login')
        return
      }
      if (!res.ok) throw new Error(t('dashboard.dataLoadFailed'))
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? t('common.unknownError'))
      const overview: DashboardData = json.data
      if (overview.coreMetrics.totalEmployees === 0) {
        setPageState('empty')
      } else {
        setData(overview)
        setPageState('ready')
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('dashboard.dataLoadFailed'))
      setPageState('error')
    }
  }, [router, t])

  useEffect(() => {
    fetchOverview()
  }, [fetchOverview])

  return (
    <div>
      <div className='mb-6'>
        <h1 className='font-bold text-2xl text-gray-900'>{t('dashboard.title')}</h1>
      </div>

      {pageState === 'loading' && <LoadingSkeleton />}

      {pageState === 'empty' && <EmptyState />}

      {pageState === 'error' && (
        <div className='flex min-h-[40vh] flex-col items-center justify-center'>
          <div className='text-center'>
            <h3 className='mb-2 font-semibold text-gray-900 text-lg'>
              {t('dashboard.dataLoadFailed')}
            </h3>
            <p className='mb-4 text-gray-500 text-sm'>{errorMessage}</p>
            <Button onClick={fetchOverview}>{t('dashboard.reload')}</Button>
          </div>
        </div>
      )}

      {pageState === 'ready' && data && (
        <div className='space-y-6'>
          {/* ── Core metric cards ── */}
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            <MetricCard
              title={t('dashboard.activeEmployees')}
              value={data.coreMetrics.activeEmployees}
              subtitle={buildEmployeeSubtitle(data.coreMetrics, t)}
              alert={data.coreMetrics.errorEmployees > 0}
              onClick={() => router.push('/employees')}
            />
            <MetricCard
              title={t('dashboard.monthlyTasks')}
              value={formatNumber(
                data.coreMetrics.monthlyTasks,
                locale,
                t('dashboard.largeNumberSuffix')
              )}
              trend={
                data.coreMetrics.monthlyTasksGrowth !== 0
                  ? {
                      value: data.coreMetrics.monthlyTasksGrowth,
                      isPositive: data.coreMetrics.monthlyTasksGrowth > 0,
                    }
                  : undefined
              }
            />
            <MetricCard
              title={t('dashboard.successRate')}
              value={`${data.coreMetrics.successRate}%`}
              alert={data.coreMetrics.successRate < 95}
            />
            <MetricCard
              title={t('dashboard.pendingItems')}
              value={data.coreMetrics.pendingItems}
              subtitle={buildPendingSubtitle(data.coreMetrics, t)}
              alert={data.coreMetrics.pendingItems > 0}
              onClick={() => router.push('/tasks')}
            />
          </div>

          {/* ── Asset overview ── */}
          {data.assetOverview && <AssetOverview data={data.assetOverview} />}

          {/* ── SOP + conversation overview ── */}
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
            {data.sopOverview && (
              <Card>
                <CardContent className='flex items-center gap-3 p-4'>
                  <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50'>
                    <GitBranch className='h-5 w-5 text-violet-600' />
                  </div>
                  <div className='min-w-0 flex-1'>
                    <p className='text-gray-500 text-sm'>{t('dashboard.sopExecution')}</p>
                    <p className='font-semibold text-gray-900 text-xl'>
                      {data.sopOverview.monthlyExecutions}
                      <span className='ml-1 font-normal text-gray-400 text-sm'>
                        {t('dashboard.thisMonth')}
                      </span>
                    </p>
                    <div className='flex flex-wrap gap-x-3 text-gray-400 text-xs'>
                      <span>
                        {t('dashboard.sopDefinitions', { count: data.sopOverview.definitions })}
                      </span>
                      <span>
                        {data.sopOverview.monthlyCompleted} {t('dashboard.completed')}
                      </span>
                      {data.sopOverview.monthlyRunning > 0 && (
                        <span className='text-blue-500'>
                          {data.sopOverview.monthlyRunning} {t('dashboard.running')}
                        </span>
                      )}
                      {data.sopOverview.monthlyFailed > 0 && (
                        <span className='text-red-500'>
                          {data.sopOverview.monthlyFailed} {t('dashboard.failed')}
                        </span>
                      )}
                      {data.sopOverview.pendingApprovals > 0 && (
                        <span className='text-amber-500'>
                          {data.sopOverview.pendingApprovals} {t('dashboard.pendingApproval')}
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {data.convOverview && (
              <Card>
                <CardContent className='flex items-center gap-3 p-4'>
                  <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-50'>
                    <MessageSquare className='h-5 w-5 text-cyan-600' />
                  </div>
                  <div className='min-w-0 flex-1'>
                    <p className='text-gray-500 text-sm'>{t('dashboard.conversations')}</p>
                    <p className='font-semibold text-gray-900 text-xl'>
                      {data.convOverview.monthlyConversations}
                      <span className='ml-1 font-normal text-gray-400 text-sm'>
                        {t('dashboard.thisMonth')}
                      </span>
                    </p>
                    <div className='flex flex-wrap items-center gap-x-3 text-gray-400 text-xs'>
                      <span>
                        {t('dashboard.messages', {
                          count: formatNumber(
                            data.convOverview.monthlyMessages,
                            locale,
                            t('dashboard.largeNumberSuffix')
                          ),
                        })}
                      </span>
                      <span>
                        {t('dashboard.activeCount', {
                          count: data.convOverview.activeConversations,
                        })}
                      </span>
                      {Object.entries(data.convOverview.byChannel).map(([ch, cnt]) => {
                        const stableKey = CHANNEL_KEY_MAP[ch] ?? ch
                        const i18nKey = CHANNEL_I18N_KEY[stableKey]
                        return (
                          <span
                            key={ch}
                            className={`inline-flex items-center rounded px-1 py-0.5 font-medium text-[10px] ${CHANNEL_COLORS[stableKey] ?? 'bg-gray-100 text-gray-600'}`}
                          >
                            {i18nKey ? t(i18nKey as Parameters<typeof t>[0]) : ch} {cnt}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Trend + employee ranking ── */}
          <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='font-semibold text-base'>
                  {t('dashboard.taskTrend7d')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MemoizedTrendChart trendData={data.trendData} />
                <div className='mt-2 flex justify-between text-muted-foreground text-xs'>
                  {data.trendData.length > 0 && (
                    <>
                      <span>{data.trendData[0].date.slice(5)}</span>
                      <span>{data.trendData[data.trendData.length - 1].date.slice(5)}</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='pb-2'>
                <div className='flex items-center justify-between'>
                  <CardTitle className='font-semibold text-base'>
                    {t('dashboard.employeeRanking')}
                  </CardTitle>
                  <div className='flex gap-4 text-muted-foreground text-xs'>
                    <span>{t('dashboard.taskCount')}</span>
                    <span>{t('dashboard.successRate')}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {data.employeeRanking.length === 0 ? (
                  <div className='flex min-h-[120px] items-center justify-center text-muted-foreground text-sm'>
                    {t('dashboard.noTaskDataToday')}
                  </div>
                ) : (
                  <div className='space-y-3'>
                    {data.employeeRanking.map((item, index) => (
                      <div key={item.employeeId} className='flex items-center gap-3'>
                        <span className='w-5 text-center font-semibold text-muted-foreground text-sm'>
                          {index + 1}
                        </span>
                        <CircleDot
                          className={`h-3 w-3 shrink-0 ${STATUS_DOT[item.status] ?? 'text-gray-400'}`}
                        />
                        <Link
                          href={`/employees/${item.employeeId}`}
                          className={`flex-1 truncate font-medium text-sm hover:text-blue-600 ${item.status === 'error' ? 'text-red-600' : 'text-gray-900'}`}
                        >
                          {item.employeeName}
                        </Link>
                        <span className='font-semibold text-gray-900 text-sm'>
                          {item.todayTasks}
                        </span>
                        <span className='w-14 text-right text-muted-foreground text-xs'>
                          {item.successRate > 0 ? `${item.successRate.toFixed(1)}%` : '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── System status ── */}
          <SystemStatusCard />
        </div>
      )}
    </div>
  )
}

function buildEmployeeSubtitle(
  metrics: CoreMetrics,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
): string {
  const parts: string[] = []
  if (metrics.standbyEmployees > 0)
    parts.push(t('dashboard.standbyCount', { count: metrics.standbyEmployees }))
  if (metrics.pausedEmployees > 0)
    parts.push(t('dashboard.pausedCount', { count: metrics.pausedEmployees }))
  if (metrics.errorEmployees > 0)
    parts.push(t('dashboard.errorCount', { count: metrics.errorEmployees }))
  return parts.join(', ') || t('dashboard.totalEmployees', { total: metrics.totalEmployees })
}

function buildPendingSubtitle(
  metrics: CoreMetrics,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
): string | undefined {
  const parts: string[] = []
  if (metrics.sopWaitingCount > 0)
    parts.push(t('dashboard.sopApprovals', { count: metrics.sopWaitingCount }))
  if (metrics.errorEmployees > 0)
    parts.push(t('dashboard.errorEmployees', { count: metrics.errorEmployees }))
  return parts.length > 0 ? parts.join(', ') : undefined
}

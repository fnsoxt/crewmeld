'use client'

import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTranslation } from '@/hooks/use-translation'
import { useStatsEmployees, useStatsOverview, useStatsTrends } from '../hooks/use-stats'
import type { DateRange, EmployeeDailyDetail, OverviewSubTab } from '../types'
import { EmployeeComparisonTable } from './employee-comparison-table'
import { StatCard } from './stat-card'

interface OverviewTabProps {
  dateRange: DateRange
}

const NEEDS_OVERVIEW: OverviewSubTab[] = ['summary']
const NEEDS_TRENDS: OverviewSubTab[] = ['task-trend', 'success-trend', 'exception']
const NEEDS_EMPLOYEES: OverviewSubTab[] = ['employee-comparison']

export function OverviewTab({ dateRange }: OverviewTabProps) {
  const { t } = useTranslation()
  const [activeSubTab, setActiveSubTab] = useState<OverviewSubTab>('summary')

  const SUB_TABS: { key: OverviewSubTab; label: string }[] = useMemo(
    () => [
      { key: 'summary', label: t('stats.coreMetrics') },
      { key: 'task-trend', label: t('stats.taskTrend') },
      { key: 'success-trend', label: t('stats.successRateTrend') },
      { key: 'exception', label: t('stats.errorDistribution') },
      { key: 'employee-comparison', label: t('stats.employeeComparison') },
    ],
    [t]
  )

  const shouldFetchOverview = NEEDS_OVERVIEW.includes(activeSubTab)
  const shouldFetchTrends = NEEDS_TRENDS.includes(activeSubTab)
  const shouldFetchEmployees = NEEDS_EMPLOYEES.includes(activeSubTab)

  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
  } = useStatsOverview(shouldFetchOverview ? dateRange : null)

  const {
    data: trends,
    isLoading: trendsLoading,
    error: trendsError,
  } = useStatsTrends(shouldFetchTrends ? dateRange : null)

  const {
    data: employees,
    isLoading: employeesLoading,
    error: employeesError,
  } = useStatsEmployees(shouldFetchEmployees ? dateRange : null)

  const currentLoading =
    (shouldFetchOverview && overviewLoading) ||
    (shouldFetchTrends && trendsLoading) ||
    (shouldFetchEmployees && employeesLoading)

  const currentError =
    (shouldFetchOverview && overviewError) ||
    (shouldFetchTrends && trendsError) ||
    (shouldFetchEmployees && employeesError)

  return (
    <div>
      <div className='mb-4 flex gap-1 overflow-x-auto border-gray-200 border-b'>
        {SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key)}
            className={`whitespace-nowrap px-4 py-2 font-medium text-sm transition-colors ${
              activeSubTab === tab.key
                ? 'border-blue-600 border-b-2 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {currentError && (
        <div className='flex h-64 flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50'>
          <p className='text-red-600 text-sm'>{t('stats.overviewLoadFailed')}</p>
        </div>
      )}

      {activeSubTab === 'summary' && !currentError && (
        <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
          <StatCard
            title={t('stats.overviewTotalTasks')}
            value={currentLoading ? '--' : (overview?.totalTasks ?? 0)}
          />
          <StatCard
            title={t('stats.overviewSuccessRate')}
            value={currentLoading ? '--' : `${overview?.successRate ?? 0}`}
            suffix='%'
          />
          <StatCard
            title={t('stats.overviewErrorRate')}
            value={currentLoading ? '--' : `${overview?.failureRate ?? 0}`}
            suffix='%'
          />
          <StatCard
            title={t('stats.overviewActiveEmployees')}
            value={currentLoading ? '--' : (overview?.activeEmployees ?? 0)}
            suffix={t('stats.personSuffix')}
          />
        </div>
      )}

      {activeSubTab === 'task-trend' && !currentError && (
        <div className='rounded-xl border border-gray-200 bg-white p-5'>
          <h3 className='mb-4 font-semibold text-gray-700 text-sm'>{t('stats.taskTrend')}</h3>
          {currentLoading ? (
            <div className='h-[300px] animate-pulse rounded-lg bg-gray-100' />
          ) : (trends?.length ?? 0) === 0 ? (
            <div className='flex h-[300px] items-center justify-center text-gray-400 text-sm'>
              {t('stats.overviewNoDataInRange')}
            </div>
          ) : (
            <ResponsiveContainer width='100%' height={300}>
              <LineChart data={trends ?? []}>
                <CartesianGrid strokeDasharray='3 3' stroke='#f0f0f0' />
                <XAxis dataKey='date' tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const point = payload[0]?.payload as
                      | { totalTasks: number; employeeDetails?: EmployeeDailyDetail[] }
                      | undefined
                    if (!point) return null
                    return (
                      <div className='rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm'>
                        <p className='mb-1 font-medium text-gray-700'>{label}</p>
                        <p className='text-gray-600'>
                          {t('stats.overviewTotalTasksLabel')}{' '}
                          <span className='font-medium text-blue-600'>{point.totalTasks}</span>
                        </p>
                        {(point.employeeDetails?.length ?? 0) > 0 && (
                          <div className='mt-1.5 border-gray-100 border-t pt-1.5'>
                            <p className='mb-1 text-gray-400'>{t('stats.overviewByEmployee')}</p>
                            {point.employeeDetails!.map((emp) => (
                              <p key={emp.employeeName} className='text-gray-600'>
                                {emp.employeeName}:{' '}
                                <span className='font-medium'>{emp.taskCount}</span>
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  }}
                />
                <Line
                  type='monotone'
                  dataKey='totalTasks'
                  stroke='#3b82f6'
                  strokeWidth={2}
                  dot={false}
                  name={t('stats.overviewTotalTasks')}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {activeSubTab === 'success-trend' && !currentError && (
        <div className='rounded-xl border border-gray-200 bg-white p-5'>
          <h3 className='mb-4 font-semibold text-gray-700 text-sm'>
            {t('stats.successRateTrend')}
          </h3>
          {currentLoading ? (
            <div className='h-[300px] animate-pulse rounded-lg bg-gray-100' />
          ) : (trends?.length ?? 0) === 0 ? (
            <div className='flex h-[300px] items-center justify-center text-gray-400 text-sm'>
              {t('stats.overviewNoDataInRange')}
            </div>
          ) : (
            <ResponsiveContainer width='100%' height={300}>
              <LineChart data={trends ?? []}>
                <CartesianGrid strokeDasharray='3 3' stroke='#f0f0f0' />
                <XAxis dataKey='date' tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const point = payload[0]?.payload as
                      | {
                          successRate: number
                          totalTasks: number
                          employeeDetails?: EmployeeDailyDetail[]
                        }
                      | undefined
                    if (!point) return null
                    return (
                      <div className='rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm'>
                        <p className='mb-1 font-medium text-gray-700'>{label}</p>
                        <p className='text-gray-600'>
                          {t('stats.overviewSuccessRateLabel')}{' '}
                          <span className='font-medium text-green-600'>{point.successRate}%</span>
                        </p>
                        <p className='text-gray-600'>
                          {t('stats.overviewTaskCount')}{' '}
                          <span className='font-medium text-blue-600'>{point.totalTasks}</span>
                          {point.totalTasks === 0 && (
                            <span className='ml-1 text-gray-400'>
                              {t('stats.overviewNoTasksToday')}
                            </span>
                          )}
                        </p>
                        {(point.employeeDetails?.length ?? 0) > 0 && (
                          <div className='mt-1.5 border-gray-100 border-t pt-1.5'>
                            <p className='mb-1 text-gray-400'>{t('stats.overviewByEmployee')}</p>
                            {point.employeeDetails!.map((emp) => {
                              const rate =
                                emp.taskCount > 0
                                  ? ((emp.successCount / emp.taskCount) * 100).toFixed(1)
                                  : '0.0'
                              return (
                                <p key={emp.employeeName} className='text-gray-600'>
                                  {emp.employeeName}:{' '}
                                  <span className='font-medium text-green-600'>{rate}%</span>
                                  <span className='ml-1 text-gray-400'>
                                    ({emp.successCount}/{emp.taskCount})
                                  </span>
                                </p>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  }}
                />
                <Line
                  type='monotone'
                  dataKey='successRate'
                  stroke='#22c55e'
                  strokeWidth={2}
                  dot={false}
                  name={t('stats.overviewSuccessRate')}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {activeSubTab === 'exception' && !currentError && (
        <div className='rounded-xl border border-gray-200 bg-white p-5'>
          <h3 className='mb-4 font-semibold text-gray-700 text-sm'>
            {t('stats.errorDistribution')}
          </h3>
          {currentLoading ? (
            <div className='h-[300px] animate-pulse rounded-lg bg-gray-100' />
          ) : (trends?.length ?? 0) === 0 ? (
            <div className='flex h-[300px] items-center justify-center text-gray-400 text-sm'>
              {t('stats.overviewNoDataInRange')}
            </div>
          ) : (
            <ResponsiveContainer width='100%' height={300}>
              <BarChart data={trends ?? []}>
                <CartesianGrid strokeDasharray='3 3' stroke='#f0f0f0' />
                <XAxis dataKey='date' tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const point = payload[0]?.payload as
                      | { failureCount: number; employeeDetails?: EmployeeDailyDetail[] }
                      | undefined
                    if (!point) return null
                    const failedEmployees = (point.employeeDetails ?? []).filter(
                      (e) => e.failureCount > 0
                    )
                    return (
                      <div className='rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm'>
                        <p className='mb-1 font-medium text-gray-700'>{label}</p>
                        <p className='text-gray-600'>
                          {t('stats.overviewErrorTotal')}{' '}
                          <span className='font-medium text-red-600'>{point.failureCount}</span>
                        </p>
                        {failedEmployees.length > 0 && (
                          <div className='mt-1.5 border-gray-100 border-t pt-1.5'>
                            <p className='mb-1 text-gray-400'>
                              {t('stats.overviewErrorEmployees')}
                            </p>
                            {failedEmployees.map((emp) => (
                              <p key={emp.employeeName} className='text-gray-600'>
                                {emp.employeeName}:{' '}
                                <span className='font-medium text-red-600'>
                                  {t('stats.overviewEmployeeFailures', { count: emp.failureCount })}
                                </span>
                              </p>
                            ))}
                          </div>
                        )}
                        {point.failureCount > 0 && failedEmployees.length === 0 && (
                          <p className='mt-1 text-gray-400'>{t('stats.overviewNoEmployeeData')}</p>
                        )}
                      </div>
                    )
                  }}
                />
                <Legend />
                <Bar
                  dataKey='failureCount'
                  fill='#ef4444'
                  name={t('stats.overviewErrorRate')}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {activeSubTab === 'employee-comparison' && !currentError && (
        <EmployeeComparisonTable data={employees ?? []} isLoading={currentLoading} />
      )}
    </div>
  )
}

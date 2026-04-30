'use client'

import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTranslation } from '@/hooks/use-translation'
import { useStatsCost } from '../hooks/use-stats'
import type { DateRange } from '../types'

interface CostTabProps {
  dateRange: DateRange
}

const MODEL_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#84cc16',
]

const BAR_SIZE = 32

function TokenTooltipContent({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
}) {
  if (!active || !payload?.[0] || payload[0].value === 0) return null
  return (
    <div className='rounded bg-white px-3 py-1.5 text-xs shadow-md ring-1 ring-gray-200'>
      {payload[0].value.toLocaleString()}
    </div>
  )
}

function formatDateShort(dateStr: string): string {
  return dateStr.slice(5)
}

function ColoredModelTick({
  x,
  y,
  payload,
  colorMap,
}: {
  x?: number
  y?: number
  payload?: { value: string }
  colorMap: Record<string, string>
}) {
  const model = payload?.value ?? ''
  return (
    <g transform={`translate(${x ?? 0},${(y ?? 0) + 8})`}>
      <text
        textAnchor='end'
        fontSize={11}
        fill={colorMap[model] ?? '#9ca3af'}
        transform='rotate(-30)'
      >
        {model}
      </text>
    </g>
  )
}

export function CostTab({ dateRange }: CostTabProps) {
  const { t } = useTranslation()
  const { data: costData, isLoading } = useStatsCost(dateRange)

  const allModels = costData?.allModels ?? []

  const modelColorMap = useMemo(() => {
    const map: Record<string, string> = {}
    allModels.forEach((m, i) => {
      map[m] = MODEL_COLORS[i % MODEL_COLORS.length]
    })
    return map
  }, [allModels])

  const tokenChartData = useMemo(() => {
    const tokenMap = new Map<string, number>()
    costData?.tokensByModel?.forEach((item) => tokenMap.set(item.model, item.tokens))
    return allModels.map((model) => ({
      model,
      tokens: tokenMap.get(model) ?? 0,
    }))
  }, [costData, allModels])

  const hasTokenData = tokenChartData.some((d) => d.tokens > 0)

  const employeeTokenPieData = useMemo(() => {
    return (costData?.costByEmployee ?? [])
      .filter((emp) => emp.totalTokens > 0)
      .map((emp) => ({ name: emp.employeeName, value: emp.totalTokens }))
  }, [costData])

  const employeeTotalTokens = useMemo(() => {
    return employeeTokenPieData.reduce((sum, d) => sum + d.value, 0)
  }, [employeeTokenPieData])

  const hasEmployeeData = employeeTokenPieData.length > 0

  const tokenPieData = useMemo(() => {
    return tokenChartData
      .filter((d) => d.tokens > 0)
      .map((d) => ({
        name: d.model,
        value: d.tokens,
      }))
  }, [tokenChartData])

  const totalTokens = useMemo(() => {
    return tokenPieData.reduce((sum, d) => sum + d.value, 0)
  }, [tokenPieData])

  const dailyTokenLineData = useMemo(() => {
    return (costData?.dailyTokens ?? []).map((d) => ({
      date: formatDateShort(d.date),
      tokens: d.tokens,
    }))
  }, [costData])

  const hasDailyTokenData = dailyTokenLineData.some((d) => d.tokens > 0)

  const tokenChartWidth = Math.max(tokenChartData.length * (BAR_SIZE + 24) + 80, 300)

  const noDataHint = (
    <p className='mt-2 text-center text-gray-400 text-xs'>{t('stats.costNoData')}</p>
  )

  return (
    <div>
      <div className='rounded-xl border border-gray-200 bg-white p-5'>
        <h3 className='mb-4 font-semibold text-gray-700 text-sm'>{t('stats.costByModelTokens')}</h3>
        {isLoading ? (
          <div className='h-[300px] animate-pulse rounded-lg bg-gray-100' />
        ) : (
          <>
            <div className='overflow-x-auto'>
              <div style={{ minWidth: tokenChartWidth, height: 300 }}>
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart
                    data={tokenChartData}
                    margin={{ top: 20, right: 10, bottom: 40, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray='3 3' stroke='#f0f0f0' />
                    <XAxis
                      dataKey='model'
                      interval={0}
                      height={60}
                      tick={(props: Record<string, unknown>) => (
                        <ColoredModelTick {...props} colorMap={modelColorMap} />
                      )}
                    />
                    <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} />
                    <Tooltip content={<TokenTooltipContent />} cursor={false} />
                    <Bar dataKey='tokens' name='Token' barSize={BAR_SIZE} radius={[4, 4, 0, 0]}>
                      {tokenChartData.map((entry, index) => (
                        <Cell
                          key={`token-cell-${index}`}
                          fill={
                            modelColorMap[entry.model] ?? MODEL_COLORS[index % MODEL_COLORS.length]
                          }
                        />
                      ))}
                      <LabelList
                        dataKey='tokens'
                        position='top'
                        fontSize={11}
                        fill='#374151'
                        formatter={(v: unknown) =>
                          (typeof v === 'number' && v > 0 ? v.toLocaleString() : '') as string
                        }
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            {!hasTokenData && noDataHint}
          </>
        )}
      </div>

      <div className='mt-6 grid grid-cols-2 gap-6'>
        <div className='rounded-xl border border-gray-200 bg-white p-5'>
          <h3 className='mb-4 font-semibold text-gray-700 text-sm'>
            {t('stats.costByEmployeeUsage')}
            {employeeTotalTokens > 0 && (
              <span className='ml-2 font-normal text-gray-400 text-xs'>
                {t('stats.costTotalTokens', { count: employeeTotalTokens.toLocaleString() })}
              </span>
            )}
          </h3>
          {isLoading ? (
            <div className='h-[280px] animate-pulse rounded-lg bg-gray-100' />
          ) : (
            <>
              <div className='flex items-center gap-4'>
                <div className='w-1/2 shrink-0'>
                  <ResponsiveContainer width='100%' height={240}>
                    <PieChart>
                      <Pie
                        data={employeeTokenPieData}
                        cx='50%'
                        cy='50%'
                        labelLine={false}
                        outerRadius={90}
                        dataKey='value'
                      >
                        {employeeTokenPieData.map((_entry, index) => (
                          <Cell
                            key={`emp-pie-${index}`}
                            fill={MODEL_COLORS[index % MODEL_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={((value: number) => `${value.toLocaleString()} tokens`) as never}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul
                  className='flex w-1/2 flex-col gap-2 overflow-y-auto'
                  style={{ maxHeight: 240 }}
                >
                  {employeeTokenPieData.map((entry, index) => {
                    const pct =
                      employeeTotalTokens > 0
                        ? ((entry.value / employeeTotalTokens) * 100).toFixed(1)
                        : '0.0'
                    return (
                      <li
                        key={entry.name}
                        className='flex items-center gap-2 text-gray-600 text-xs'
                      >
                        <span
                          className='inline-block h-2.5 w-2.5 shrink-0 rounded-full'
                          style={{ backgroundColor: MODEL_COLORS[index % MODEL_COLORS.length] }}
                        />
                        <span className='truncate' title={entry.name}>
                          {entry.name}
                        </span>
                        <span className='ml-auto shrink-0 text-gray-400 tabular-nums'>{pct}%</span>
                        <span className='shrink-0 text-gray-400 tabular-nums'>
                          {entry.value.toLocaleString()}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
              {!hasEmployeeData && noDataHint}
            </>
          )}
        </div>

        <div className='rounded-xl border border-gray-200 bg-white p-5'>
          <h3 className='mb-4 font-semibold text-gray-700 text-sm'>
            {t('stats.costByModelDistribution')}
            {totalTokens > 0 && (
              <span className='ml-2 font-normal text-gray-400 text-xs'>
                {t('stats.costTotalTokens', { count: totalTokens.toLocaleString() })}
              </span>
            )}
          </h3>
          {isLoading ? (
            <div className='h-[280px] animate-pulse rounded-lg bg-gray-100' />
          ) : (
            <>
              <div className='flex items-center gap-4'>
                <div className='w-1/2 shrink-0'>
                  <ResponsiveContainer width='100%' height={240}>
                    <PieChart>
                      <Pie
                        data={tokenPieData}
                        cx='50%'
                        cy='50%'
                        labelLine={false}
                        outerRadius={90}
                        dataKey='value'
                      >
                        {tokenPieData.map((entry, index) => (
                          <Cell
                            key={`token-pie-${index}`}
                            fill={
                              modelColorMap[entry.name] ?? MODEL_COLORS[index % MODEL_COLORS.length]
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={((value: number) => `${value.toLocaleString()} tokens`) as never}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul
                  className='flex w-1/2 flex-col gap-2 overflow-y-auto'
                  style={{ maxHeight: 240 }}
                >
                  {tokenPieData.map((entry, index) => {
                    const pct =
                      totalTokens > 0 ? ((entry.value / totalTokens) * 100).toFixed(1) : '0.0'
                    const color =
                      modelColorMap[entry.name] ?? MODEL_COLORS[index % MODEL_COLORS.length]
                    return (
                      <li
                        key={entry.name}
                        className='flex items-center gap-2 text-gray-600 text-xs'
                      >
                        <span
                          className='inline-block h-2.5 w-2.5 shrink-0 rounded-full'
                          style={{ backgroundColor: color }}
                        />
                        <span className='truncate' title={entry.name}>
                          {entry.name}
                        </span>
                        <span className='ml-auto shrink-0 text-gray-400 tabular-nums'>{pct}%</span>
                        <span className='shrink-0 text-gray-400 tabular-nums'>
                          {entry.value.toLocaleString()}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
              {!hasTokenData && noDataHint}
            </>
          )}
        </div>
      </div>

      <div className='mt-6 rounded-xl border border-gray-200 bg-white p-5'>
        <h3 className='mb-4 font-semibold text-gray-700 text-sm'>{t('stats.costDailyTrend')}</h3>
        {isLoading ? (
          <div className='h-[300px] animate-pulse rounded-lg bg-gray-100' />
        ) : (
          <>
            <ResponsiveContainer width='100%' height={300}>
              <LineChart data={dailyTokenLineData}>
                <CartesianGrid strokeDasharray='3 3' stroke='#f0f0f0' />
                <XAxis dataKey='date' tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <Tooltip
                  formatter={((value: number) => `${value.toLocaleString()} tokens`) as never}
                />
                <Line
                  type='monotone'
                  dataKey='tokens'
                  stroke='#3b82f6'
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  name={t('stats.costTotalTokensLabel')}
                >
                  <LabelList
                    dataKey='tokens'
                    position='top'
                    fontSize={10}
                    fill='#374151'
                    formatter={((v: number) => (v > 0 ? v.toLocaleString() : '')) as never}
                  />
                </Line>
              </LineChart>
            </ResponsiveContainer>
            {!hasDailyTokenData && noDataHint}
          </>
        )}
      </div>
    </div>
  )
}

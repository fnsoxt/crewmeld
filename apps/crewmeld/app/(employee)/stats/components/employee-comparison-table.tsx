'use client'

import { useTranslation } from '@/hooks/use-translation'
import type { EmployeeComparisonRow } from '../types'

interface EmployeeComparisonTableProps {
  data: EmployeeComparisonRow[]
  isLoading: boolean
}

export function EmployeeComparisonTable({ data, isLoading }: EmployeeComparisonTableProps) {
  const { t } = useTranslation()

  return (
    <div className='overflow-hidden rounded-xl border border-gray-200 bg-white'>
      <div className='px-5 py-4'>
        <h3 className='font-semibold text-gray-700 text-sm'>{t('stats.comparisonTitle')}</h3>
      </div>
      <div className='overflow-x-auto'>
        <table className='w-full'>
          <thead>
            <tr className='border-gray-100 border-b bg-gray-50'>
              <th className='px-5 py-3 text-left font-medium text-gray-500 text-xs uppercase'>
                {t('stats.comparisonEmployee')}
              </th>
              <th className='px-5 py-3 text-right font-medium text-gray-500 text-xs uppercase'>
                {t('stats.comparisonTasks')}
              </th>
              <th className='px-5 py-3 text-right font-medium text-gray-500 text-xs uppercase'>
                {t('stats.comparisonSuccessRate')}
              </th>
              <th className='px-5 py-3 text-right font-medium text-gray-500 text-xs uppercase'>
                {t('stats.comparisonErrorRate')}
              </th>
              <th className='px-5 py-3 text-right font-medium text-gray-500 text-xs uppercase'>
                {t('stats.comparisonConversations')}
              </th>
              <th className='px-5 py-3 text-right font-medium text-gray-500 text-xs uppercase'>
                {t('stats.comparisonAvgDuration')}
              </th>
              <th className='px-5 py-3 text-right font-medium text-gray-500 text-xs uppercase'>
                {t('stats.comparisonTokenUsage')}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className='border-gray-100 border-b'>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className='px-5 py-3'>
                      <div className='h-4 animate-pulse rounded bg-gray-200' />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={7} className='px-5 py-12 text-center text-gray-400 text-sm'>
                  {t('stats.comparisonNoData')}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={row.employeeId}
                  className='border-gray-100 border-b transition-colors hover:bg-gray-50'
                >
                  <td className='px-5 py-3 font-medium text-gray-900 text-sm'>
                    {row.employeeName}
                  </td>
                  <td className='px-5 py-3 text-right text-gray-700 text-sm'>{row.totalTasks}</td>
                  <td className='px-5 py-3 text-right text-gray-700 text-sm'>
                    {row.successRate.toFixed(1)}%
                  </td>
                  <td className='px-5 py-3 text-right text-gray-700 text-sm'>
                    <span className={row.failureRate > 5 ? 'font-medium text-red-600' : ''}>
                      {row.failureRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className='px-5 py-3 text-right text-gray-700 text-sm'>
                    {row.conversationCount ?? 0}
                  </td>
                  <td className='px-5 py-3 text-right text-gray-700 text-sm'>
                    {row.avgDurationMs < 1000
                      ? `${row.avgDurationMs}ms`
                      : `${(row.avgDurationMs / 1000).toFixed(1)}s`}
                  </td>
                  <td className='px-5 py-3 text-right text-gray-700 text-sm'>
                    {row.totalTokens.toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

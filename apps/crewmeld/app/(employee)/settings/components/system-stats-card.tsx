'use client'

import { useTranslation } from '@/hooks/use-translation'
import type { SystemStats } from '../types'

interface SystemStatsCardProps {
  data: SystemStats
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className='flex items-center justify-between py-2'>
      <span className='text-gray-500 text-sm'>{label}</span>
      <span className='font-medium text-gray-900 text-sm'>{value}</span>
    </div>
  )
}

function UsageBar({
  label,
  usedLabel,
  percent,
}: {
  label: string
  usedLabel: string
  percent: number
}) {
  return (
    <div className='py-2'>
      <div className='mb-1.5 flex items-center justify-between'>
        <span className='text-gray-500 text-sm'>{label}</span>
        <span className='text-gray-400 text-xs'>{usedLabel}</span>
      </div>
      <div className='h-2 w-full overflow-hidden rounded-full bg-gray-100'>
        <div
          className={`h-full rounded-full transition-all ${
            percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-yellow-500' : 'bg-blue-500'
          }`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  )
}

export function SystemStatsCard({ data }: SystemStatsCardProps) {
  const { t } = useTranslation()
  return (
    <div className='rounded-xl border border-gray-200 bg-white p-6'>
      <h3 className='mb-4 font-semibold text-base text-gray-900'>{t('settings.statsTitle')}</h3>
      <div className='divide-y divide-gray-100'>
        <StatRow
          label={t('settings.statsUsers')}
          value={`${data.totalUsers} ${t('settings.statsUsersSuffix')}`}
        />
        <StatRow
          label={t('settings.statsEmployees')}
          value={`${data.totalEmployees} ${t('settings.statsEmployeesSuffix')}`}
        />
        <StatRow
          label={t('settings.statsTasksTotal')}
          value={data.totalTasksExecuted.toLocaleString()}
        />
        <StatRow label={t('settings.statsUptime')} value={formatUptime(data.uptimeSeconds)} />
        <UsageBar
          label={t('settings.statsMemory')}
          usedLabel={`${data.memoryUsage.usedMb} MB / ${data.memoryUsage.totalMb} MB (${data.memoryUsage.usagePercent}%)`}
          percent={data.memoryUsage.usagePercent}
        />
        <UsageBar
          label={t('settings.statsDisk')}
          usedLabel={`${data.diskUsage.usedGb} GB / ${data.diskUsage.totalGb} GB (${data.diskUsage.usagePercent}%)`}
          percent={data.diskUsage.usagePercent}
        />
      </div>
    </div>
  )
}

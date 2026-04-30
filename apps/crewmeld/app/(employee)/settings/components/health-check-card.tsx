'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from '@/hooks/use-translation'
import type { HealthCheckResult, ServiceHealth } from '../types'

interface HealthCheckCardProps {
  data: HealthCheckResult
  onRefresh: () => Promise<void>
}

export function HealthCheckCard({ data, onRefresh }: HealthCheckCardProps) {
  const { t } = useTranslation()

  const STATUS_STYLE: Record<ServiceHealth['status'], { dotClass: string; label: string }> = {
    healthy: { dotClass: 'bg-green-500', label: t('settings.healthStatusHealthy') },
    unhealthy: { dotClass: 'bg-red-500', label: t('settings.healthStatusUnhealthy') },
    timeout: { dotClass: 'bg-red-500', label: t('settings.healthStatusTimeout') },
    not_configured: { dotClass: 'bg-gray-300', label: t('settings.healthStatusNotConfigured') },
  }
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div className='rounded-xl border border-gray-200 bg-white p-6'>
      <div className='mb-4 flex items-center justify-between'>
        <h3 className='font-semibold text-base text-gray-900'>{t('settings.healthCheckTitle')}</h3>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className='flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-blue-600 text-xs transition-colors hover:bg-blue-50 disabled:opacity-50'
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          {t('settings.healthCheckRefresh')}
        </button>
      </div>

      <div className='divide-y divide-gray-100'>
        {data.services.map((service) => {
          const style = STATUS_STYLE[service.status]
          return (
            <div key={service.name} className='flex items-center justify-between py-3'>
              <div className='flex items-center gap-3'>
                <div className={`h-2.5 w-2.5 rounded-full ${style.dotClass}`} />
                <span className='font-medium text-gray-900 text-sm'>{service.name}</span>
                {service.version && (
                  <span className='text-gray-400 text-xs'>{service.version}</span>
                )}
              </div>
              <div className='flex items-center gap-3'>
                {service.latencyMs !== null && service.status === 'healthy' && (
                  <span className='text-gray-400 text-xs'>{service.latencyMs}ms</span>
                )}
                {service.message && service.status !== 'healthy' && (
                  <span className='text-gray-400 text-xs'>{service.message}</span>
                )}
                <span
                  className={`font-medium text-xs ${
                    service.status === 'healthy'
                      ? 'text-green-600'
                      : service.status === 'not_configured'
                        ? 'text-gray-400'
                        : 'text-red-600'
                  }`}
                >
                  {style.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className='mt-3 text-gray-400 text-xs'>
        {t('settings.healthCheckLastTime')}
        {new Date(data.checkedAt).toLocaleString()}
      </div>
    </div>
  )
}

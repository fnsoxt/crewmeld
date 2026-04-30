'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/hooks/use-translation'
import { HealthCheckCard } from '../components/health-check-card'
import { LicenseCard } from '../components/license-card'
import { SystemStatsCard } from '../components/system-stats-card'
import { VersionCard } from '../components/version-card'
import { SettingsTabs } from '../settings-tabs'
import type { SystemInfoResponse } from '../types'

type PageState = 'loading' | 'ready' | 'error'

export default function SystemInfoPage() {
  const router = useRouter()
  const { t } = useTranslation()

  const [pageState, setPageState] = useState<PageState>('loading')
  const [data, setData] = useState<SystemInfoResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const fetchSystemInfo = useCallback(async () => {
    setPageState('loading')
    try {
      const res = await fetch('/api/employee/settings/system-info')
      if (res.status === 401) {
        router.push('/login')
        return
      }
      if (!res.ok) throw new Error(t('settings.systemInfoLoadFailed'))
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? t('settings.unknownError'))
      setData(json.data)
      setPageState('ready')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('settings.systemInfoLoadFailed'))
      setPageState('error')
    }
  }, [router])

  const handleRefreshHealthCheck = useCallback(async () => {
    try {
      const res = await fetch('/api/employee/settings/system-info/health-check', {
        method: 'POST',
      })
      if (!res.ok) throw new Error(t('settings.healthCheckFailed'))
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? t('settings.healthCheckFailed'))
      setData((prev) => (prev ? { ...prev, healthCheck: json.data } : prev))
    } catch {
      // Health check refresh failure is non-fatal — card stays with previous data
    }
  }, [])

  useEffect(() => {
    fetchSystemInfo()
  }, [fetchSystemInfo])

  return (
    <div>
      <div className='mb-6'>
        <h1 className='font-bold text-2xl text-gray-900'>{t('settings.title')}</h1>
        <p className='mt-1 text-gray-500 text-sm'>{t('settings.subtitleSystem')}</p>
      </div>

      <SettingsTabs />

      {pageState === 'loading' && (
        <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className='h-64 animate-pulse rounded-xl border border-gray-200 bg-gray-50'
            />
          ))}
        </div>
      )}

      {pageState === 'error' && (
        <div className='flex flex-col items-center gap-4 rounded-xl border border-red-200 bg-red-50 py-16'>
          <p className='text-red-600 text-sm'>{errorMessage}</p>
          <button
            onClick={fetchSystemInfo}
            className='rounded-lg bg-red-600 px-4 py-2 font-medium text-sm text-white hover:bg-red-700'
          >
            {t('settings.reload')}
          </button>
        </div>
      )}

      {pageState === 'ready' && data && (
        <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
          <VersionCard data={data.version} deploymentInfo={data.deploymentInfo} />
          <LicenseCard data={data.license} onRefresh={fetchSystemInfo} />
          <HealthCheckCard data={data.healthCheck} onRefresh={handleRefreshHealthCheck} />
          <SystemStatsCard data={data.stats} />
        </div>
      )}
    </div>
  )
}

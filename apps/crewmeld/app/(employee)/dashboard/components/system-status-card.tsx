'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, MinusCircle, Server } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslation } from '@/hooks/use-translation'

interface ComponentStatus {
  status: 'ok' | 'error' | 'skipped'
  latencyMs: number
  error?: string
}

interface SystemInfo {
  version: string
  features: Record<string, boolean>
}

interface ReadyData {
  components: Record<string, ComponentStatus>
}

function StatusDot({ status }: { status: 'ok' | 'error' | 'skipped' }) {
  switch (status) {
    case 'ok':
      return <CheckCircle2 className='h-4 w-4 text-green-500' />
    case 'error':
      return <AlertCircle className='h-4 w-4 text-red-500' />
    case 'skipped':
      return <MinusCircle className='h-4 w-4 text-gray-400' />
  }
}

export function SystemStatusCard() {
  const { t } = useTranslation()
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [ready, setReady] = useState<ReadyData | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [infoRes, readyRes] = await Promise.all([
          fetch('/api/system/info'),
          fetch('/api/ready'),
        ])
        if (infoRes.ok) {
          const json = await infoRes.json()
          // /api/system/info returns the apiOk envelope { success, data, message }
          // while /api/ready returns a raw JSON body. Accept either shape.
          setInfo(json?.data ?? json)
          setVisible(true)
        }
        if (readyRes.ok) {
          const json = await readyRes.json()
          setReady(json?.data ?? json)
        }
      } catch {
        // silent — card not visible if info fails
      }
    }
    load()
  }, [])

  if (!visible || !info) return null

  return (
    <Card data-testid='dashboard:system-status-card'>
      <CardHeader className='pb-2'>
        <CardTitle className='flex items-center gap-2 font-semibold text-base'>
          <Server className='h-4 w-4' />
          {t('dashboard.systemStatus')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
          <div className='text-sm'>
            <span className='text-gray-500'>{t('dashboard.version')}</span>
            <p className='font-medium text-gray-900'>{info.version}</p>
          </div>

          {ready &&
            Object.entries(ready.components).map(([key, comp]) => (
              <div key={key} className='text-sm'>
                <span className='text-gray-500'>
                  {key === 'database' ? t('dashboard.database') : key === 'redis' ? 'Redis' : key}
                </span>
                <div className='flex items-center gap-1'>
                  <StatusDot status={comp.status} />
                  <span className='text-gray-400 text-xs'>
                    {comp.status === 'ok' && `${comp.latencyMs}ms`}
                    {comp.status === 'skipped' && t('dashboard.notConfigured')}
                    {comp.status === 'error' && t('employees.statusError')}
                  </span>
                </div>
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  )
}

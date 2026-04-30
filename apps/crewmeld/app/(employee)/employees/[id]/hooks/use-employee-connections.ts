'use client'

import { useCallback, useEffect, useState } from 'react'
import type { HealthMessageI18n } from '@/lib/connectors/types'
import { useTranslation } from '@/hooks/use-translation'

interface BoundConnection {
  bindingId: string
  connectionId: string
  name: string
  type: string
  description: string | null
  status: string
  statusIndicator: string
  lastHealthCheck: string | null
  lastHealthMessageI18n: HealthMessageI18n | null
  createdAt: string
  boundAt: string
  config: Record<string, unknown>
  isChannel: boolean
}

interface AvailableConnection {
  connectionId: string
  name: string
  type: string
  description: string | null
  status: string
  statusIndicator: string
  isChannel: boolean
}

interface UseEmployeeConnectionsReturn {
  boundConnections: BoundConnection[]
  availableConnections: AvailableConnection[]
  loading: boolean
  error: string | null
  bind: (connectionId: string) => Promise<void>
  unbind: (connectionId: string) => Promise<void>
  refetch: () => void
}

export function useEmployeeConnections(employeeId: string): UseEmployeeConnectionsReturn {
  const { t } = useTranslation()
  const [boundConnections, setBoundConnections] = useState<BoundConnection[]>([])
  const [availableConnections, setAvailableConnections] = useState<AvailableConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchConnections = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch(`/api/employee/employees/${employeeId}/connections`)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? t('common.loadConnectionFailed'))
        return
      }
      const json = await res.json()
      if (json.success) {
        setBoundConnections(json.data.bound)
        setAvailableConnections(json.data.available)
      }
    } catch {
      setError(t('common.networkError'))
    } finally {
      setLoading(false)
    }
  }, [employeeId])

  useEffect(() => {
    fetchConnections()
  }, [fetchConnections])

  const bind = useCallback(
    async (connectionId: string) => {
      const res = await fetch(`/api/employee/employees/${employeeId}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? t('common.bindFailed'))
      }
      await fetchConnections()
    },
    [employeeId, fetchConnections]
  )

  const unbind = useCallback(
    async (connectionId: string) => {
      const res = await fetch(`/api/employee/employees/${employeeId}/connections/${connectionId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? t('common.unbindFailed'))
      }
      await fetchConnections()
    },
    [employeeId, fetchConnections]
  )

  return {
    boundConnections,
    availableConnections,
    loading,
    error,
    bind,
    unbind,
    refetch: fetchConnections,
  }
}

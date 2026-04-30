'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ConnectionCardData } from '@/lib/connectors/types'
import { useTranslation } from '@/hooks/use-translation'

interface UseConnectionsOptions {
  type?: string
  status?: string
}

export function useConnections(options: UseConnectionsOptions = {}) {
  const { t, tMessage } = useTranslation()
  const [connections, setConnections] = useState<ConnectionCardData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchConnections = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (options.type && options.type !== 'all') params.set('type', options.type)
      if (options.status && options.status !== 'all') params.set('status', options.status)

      const qs = params.toString()
      const res = await fetch(`/api/employee/connectors${qs ? `?${qs}` : ''}`)
      const json = await res.json()

      if (json.success) {
        setConnections(json.data.connections)
      } else {
        setError(tMessage(json) || t('common.fetchListFailed'))
      }
    } catch {
      setError(t('common.networkError'))
    } finally {
      setLoading(false)
    }
  }, [options.type, options.status])

  useEffect(() => {
    fetchConnections()
  }, [fetchConnections])

  return { connections, loading, error, refetch: fetchConnections }
}

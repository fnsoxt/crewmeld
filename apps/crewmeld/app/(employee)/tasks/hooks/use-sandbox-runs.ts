'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '@/hooks/use-translation'
import type { SandboxRunListResponse } from '../types'

interface UseSandboxRunsOptions {
  runType?: string
  status?: string
  page?: number
  pageSize?: number
}

interface UseSandboxRunsReturn {
  data: SandboxRunListResponse | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useSandboxRuns(options: UseSandboxRunsOptions): UseSandboxRunsReturn {
  const { t } = useTranslation()
  const { runType, status, page = 1, pageSize = 20 } = options

  const [data, setData] = useState<SandboxRunListResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRuns = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (runType) params.set('run_type', runType)
      if (status) params.set('status', status)
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))

      const response = await fetch(`/api/sandbox/runs?${params.toString()}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const result: SandboxRunListResponse = await response.json()
      setData(result)
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.unknownError')
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [runType, status, page, pageSize])

  useEffect(() => {
    setIsLoading(true)
    fetchRuns()
  }, [fetchRuns])

  return { data, isLoading, error, refetch: fetchRuns }
}

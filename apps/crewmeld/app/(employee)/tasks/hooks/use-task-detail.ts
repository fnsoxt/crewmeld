'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '@/hooks/use-translation'
import type { SopExecutionDetail } from '../types'

interface UseTaskDetailReturn {
  data: SopExecutionDetail | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useTaskDetail(executionId: string): UseTaskDetailReturn {
  const { t } = useTranslation()
  const [data, setData] = useState<SopExecutionDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDetail = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/employee/tasks/${executionId}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const result = await response.json()
      if (result.success) {
        setData(result.data)
        setError(null)
      } else {
        setError(result.error ?? t('common.unknownError'))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.unknownError')
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [executionId])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  return { data, isLoading, error, refetch: fetchDetail }
}

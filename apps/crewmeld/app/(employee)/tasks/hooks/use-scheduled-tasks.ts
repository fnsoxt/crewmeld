'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '@/hooks/use-translation'
import type { ScheduledTaskListResponse } from '../types'

interface UseScheduledTasksOptions {
  page?: number
  pageSize?: number
}

interface UseScheduledTasksReturn {
  data: ScheduledTaskListResponse | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useScheduledTasks(options: UseScheduledTasksOptions = {}): UseScheduledTasksReturn {
  const { t } = useTranslation()
  const { page = 1, pageSize = 20 } = options
  const [data, setData] = useState<ScheduledTaskListResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      const res = await fetch(`/api/employee/scheduled-tasks?${params}`)
      if (!res.ok) throw new Error(t('common.loadFailed'))
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.loadFailed'))
    } finally {
      setIsLoading(false)
    }
  }, [page, pageSize])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, isLoading, error, refetch: fetchData }
}

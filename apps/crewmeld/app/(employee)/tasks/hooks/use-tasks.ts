'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/hooks/use-translation'
import type { SopExecutionListResponse } from '../types'

interface UseTasksOptions {
  status?: string
  sopId?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
  autoRefresh?: boolean
  refreshInterval?: number
}

interface UseTasksReturn {
  data: SopExecutionListResponse | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useTasks(options: UseTasksOptions): UseTasksReturn {
  const { t } = useTranslation()
  const {
    status,
    sopId,
    dateFrom,
    dateTo,
    page = 1,
    pageSize = 20,
    autoRefresh = false,
    refreshInterval = 5000,
  } = options

  const [data, setData] = useState<SopExecutionListResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (sopId) params.set('sop_id', sopId)
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      params.set('page', String(page))
      params.set('page_size', String(pageSize))

      const response = await fetch(`/api/employee/tasks?${params.toString()}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const result: SopExecutionListResponse = await response.json()
      setData(result)
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.unknownError')
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [status, sopId, dateFrom, dateTo, page, pageSize])

  useEffect(() => {
    setIsLoading(true)
    fetchTasks()
  }, [fetchTasks])

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchTasks, refreshInterval)
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [autoRefresh, refreshInterval, fetchTasks])

  return { data, isLoading, error, refetch: fetchTasks }
}

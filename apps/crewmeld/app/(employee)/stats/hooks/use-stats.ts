'use client'

import { useCallback, useEffect, useState } from 'react'
import type {
  CostResponse,
  DateRange,
  EmployeeComparisonRow,
  OverviewMetrics,
  TrendDataPoint,
} from '../types'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

function isValidDateRange(dateRange: DateRange | null): dateRange is DateRange {
  return dateRange !== null && DATE_REGEX.test(dateRange.from) && DATE_REGEX.test(dateRange.to)
}

function buildDateParams(dateRange: DateRange): string {
  const params = new URLSearchParams()
  params.set('date_from', dateRange.from)
  params.set('date_to', dateRange.to)
  return params.toString()
}

interface UseFetchReturn<T> {
  data: T | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

function useFetch<T>(url: string | null): UseFetchReturn<T> {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(url !== null)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!url) return
    try {
      setIsLoading(true)
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result = await response.json()
      if (result.success) {
        setData(result.data)
        setError(null)
      } else {
        setError(result.error ?? 'Unknown error')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [url])

  useEffect(() => {
    if (url) {
      setIsLoading(true)
      fetchData()
    } else {
      setData(null)
      setIsLoading(false)
      setError(null)
    }
  }, [url, fetchData])

  const noop = useCallback(() => {}, [])

  return { data, isLoading, error, refetch: url ? fetchData : noop }
}

export function useStatsOverview(dateRange: DateRange | null): UseFetchReturn<OverviewMetrics> {
  return useFetch<OverviewMetrics>(
    isValidDateRange(dateRange)
      ? `/api/employee/stats/overview?${buildDateParams(dateRange)}`
      : null
  )
}

export function useStatsTrends(dateRange: DateRange | null): UseFetchReturn<TrendDataPoint[]> {
  return useFetch<TrendDataPoint[]>(
    isValidDateRange(dateRange) ? `/api/employee/stats/trends?${buildDateParams(dateRange)}` : null
  )
}

export function useStatsCost(dateRange: DateRange | null): UseFetchReturn<CostResponse['data']> {
  return useFetch<CostResponse['data']>(
    isValidDateRange(dateRange) ? `/api/employee/stats/cost?${buildDateParams(dateRange)}` : null
  )
}

export function useStatsEmployees(
  dateRange: DateRange | null
): UseFetchReturn<EmployeeComparisonRow[]> {
  return useFetch<EmployeeComparisonRow[]>(
    isValidDateRange(dateRange)
      ? `/api/employee/stats/employees?${buildDateParams(dateRange)}`
      : null
  )
}

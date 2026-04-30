'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface UsePendingCountReturn {
  count: number
  isLoading: boolean
}

export function usePendingCount(refreshInterval = 60000): UsePendingCountReturn {
  const [count, setCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const isVisible = useRef(true)

  const fetchCount = useCallback(async () => {
    // Skip request when page is not visible
    if (!isVisible.current) return
    try {
      const response = await fetch('/api/employee/tasks/pending-count')
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setCount(result.data.count)
        }
      }
    } catch {
      // Silently fail for badge count
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCount()
    const interval = setInterval(fetchCount, refreshInterval)

    // Pause polling when page is not visible
    const handleVisibility = () => {
      isVisible.current = document.visibilityState === 'visible'
      if (isVisible.current) fetchCount()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [fetchCount, refreshInterval])

  return { count, isLoading }
}

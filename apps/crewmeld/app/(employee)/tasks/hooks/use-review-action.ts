'use client'

import { useCallback, useState } from 'react'

interface UseReviewActionReturn {
  approve: (pauseId: string, comment: string) => Promise<boolean>
  reject: (pauseId: string, comment: string) => Promise<boolean>
  isSubmitting: boolean
  error: string | null
}

export function useReviewAction(): UseReviewActionReturn {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const approve = useCallback(async (pauseId: string, comment: string): Promise<boolean> => {
    setIsSubmitting(true)
    setError(null)
    try {
      const response = await fetch(`/api/employee/tasks/${pauseId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
      })
      const result = await response.json()
      if (!result.success) {
        setError(result.error ?? 'Approval failed')
        return false
      }
      return true
    } catch {
      setError('Network error, please retry')
      return false
    } finally {
      setIsSubmitting(false)
    }
  }, [])

  const reject = useCallback(async (pauseId: string, comment: string): Promise<boolean> => {
    setIsSubmitting(true)
    setError(null)
    try {
      const response = await fetch(`/api/employee/tasks/${pauseId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
      })
      const result = await response.json()
      if (!result.success) {
        setError(result.error ?? 'Rejection failed')
        return false
      }
      return true
    } catch {
      setError('Network error, please retry')
      return false
    } finally {
      setIsSubmitting(false)
    }
  }, [])

  return { approve, reject, isSubmitting, error }
}

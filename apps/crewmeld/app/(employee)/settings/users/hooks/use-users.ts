'use client'

import { useCallback, useEffect, useState } from 'react'
import type { PlatformUser } from '@/lib/auth/rbac/types'
import { useTranslation } from '@/hooks/use-translation'

interface UseUsersReturn {
  data: PlatformUser[] | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useUsers(): UseUsersReturn {
  const { t } = useTranslation()
  const [data, setData] = useState<PlatformUser[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch('/api/employee/users')

      if (response.status === 401) {
        setError(t('common.notLoggedIn'))
        return
      }
      if (response.status === 403) {
        setError(t('common.noPermission'))
        return
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()
      if (result.success) {
        setData(result.data)
      } else {
        setError(result.error ?? t('common.fetchUsersFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.networkError'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  return { data, isLoading, error, refetch: fetchUsers }
}

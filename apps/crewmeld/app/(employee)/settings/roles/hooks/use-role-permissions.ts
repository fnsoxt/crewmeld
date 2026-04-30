'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '@/hooks/use-translation'

export interface PermissionDef {
  code: string
  name: string
  description: string | null
  category: string
  sortOrder: number
}

export interface RolePermissionsData {
  permissions: PermissionDef[]
  rolePermissions: Record<string, string[]>
}

interface UseRolePermissionsReturn {
  data: RolePermissionsData | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useRolePermissions(): UseRolePermissionsReturn {
  const { t } = useTranslation()
  const [data, setData] = useState<RolePermissionsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch_ = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch('/api/employee/settings/roles')

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
        setError(result.error ?? t('settings.rolesLoadFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.networkError'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch_()
  }, [fetch_])

  return { data, isLoading, error, refetch: fetch_ }
}

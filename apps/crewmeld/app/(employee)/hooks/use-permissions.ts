'use client'

import { useCallback, useEffect, useState } from 'react'
import type { PlatformRole } from '@/lib/auth/rbac/types'

interface PermissionsState {
  /** Current user permission code set */
  permissions: Set<string>
  /** Current user role */
  role: PlatformRole | null
  /** Whether loading */
  loading: boolean
  /** Check if has specified permission */
  hasPermission: (code: string) => boolean
  /** Check if has any permission */
  hasAnyPermission: (codes: string[]) => boolean
  /** Backward compatible: whether admin */
  isAdmin: boolean
}

// Module-level cache: shared by components, avoids duplicate requests
let cachedPermissions: Set<string> | null = null
let cachedRole: PlatformRole | null = null
let fetchPromise: Promise<void> | null = null

function resetCache() {
  cachedPermissions = null
  cachedRole = null
  fetchPromise = null
}

async function fetchPermissions(): Promise<{
  permissions: Set<string>
  role: PlatformRole | null
}> {
  if (cachedPermissions) {
    return { permissions: cachedPermissions, role: cachedRole }
  }

  if (!fetchPromise) {
    fetchPromise = (async () => {
      try {
        const res = await fetch('/api/employee/auth/permissions')
        if (res.ok) {
          const json = await res.json()
          if (json.success) {
            cachedPermissions = new Set(json.permissions as string[])
            cachedRole = json.role ?? null
          }
        }
      } catch {
        // Silent failure
      }
      if (!cachedPermissions) {
        cachedPermissions = new Set()
      }
    })()
  }

  await fetchPromise
  return { permissions: cachedPermissions!, role: cachedRole }
}

/**
 * Get current user permission set
 * - Default: loading=true, permissions empty (buttons not rendered)
 * - After async fetch: loading=false, buttons shown per permissions
 * - Multiple components trigger only one request (module-level cache)
 */
export function usePermissions(): PermissionsState {
  const [permissions, setPermissions] = useState<Set<string>>(cachedPermissions ?? new Set())
  const [role, setRole] = useState<PlatformRole | null>(cachedRole)
  const [loading, setLoading] = useState(!cachedPermissions)

  useEffect(() => {
    if (cachedPermissions) {
      setPermissions(cachedPermissions)
      setRole(cachedRole)
      setLoading(false)
      return
    }

    let cancelled = false
    fetchPermissions().then(({ permissions: perms, role: r }) => {
      if (!cancelled) {
        setPermissions(perms)
        setRole(r)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const hasPermission = useCallback((code: string) => permissions.has(code), [permissions])

  const hasAnyPermission = useCallback(
    (codes: string[]) => codes.some((c) => permissions.has(c)),
    [permissions]
  )

  const isAdmin = role === 'admin' || role === 'super_admin'

  return { permissions, role, loading, hasPermission, hasAnyPermission, isAdmin }
}

'use client'

import type { ReactNode } from 'react'
import { usePermissions } from '../hooks/use-permissions'

interface PermissionGuardProps {
  /** Required permission code(s), shown if any is satisfied */
  requires: string | string[]
  /** Children (rendered when authorized) */
  children: ReactNode
  /** Fallback content when unauthorized (default: not rendered) */
  fallback?: ReactNode
}

/**
 * Permission guard component
 * - Loading: not rendered (buttons hidden to avoid flicker)
 * - Authorized: render children
 * - Unauthorized: render fallback (default empty)
 */
export function PermissionGuard({ requires, children, fallback = null }: PermissionGuardProps) {
  const { loading, hasPermission, hasAnyPermission } = usePermissions()

  if (loading) {
    return null
  }

  const codes = Array.isArray(requires) ? requires : [requires]
  const allowed = hasAnyPermission(codes)

  if (!allowed) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

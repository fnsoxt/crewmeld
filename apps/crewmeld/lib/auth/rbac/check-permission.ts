import { db } from '@crewmeld/db'
import { platformRolePermissions } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, eq } from 'drizzle-orm'
import { getCurrentUserRole } from './check-role'
import type { AuthCheckResult } from './types'

const logger = createLogger('RBAC:CheckPermission')

/**
 * Check whether the current user has the specified permission code
 * - super_admin passes directly (has all permissions)
 * - Other roles are checked against the platform_role_permissions table
 */
export async function requirePermission(permissionCode: string): Promise<AuthCheckResult> {
  const result = await getCurrentUserRole()

  if (!result.authenticated) {
    return result
  }

  // super_admin has all permissions, pass directly
  if (result.role === 'super_admin') {
    return result
  }

  const role = result.role ?? 'member'

  const [record] = await db
    .select({ permissionCode: platformRolePermissions.permissionCode })
    .from(platformRolePermissions)
    .where(
      and(
        eq(platformRolePermissions.role, role),
        eq(platformRolePermissions.permissionCode, permissionCode)
      )
    )
    .limit(1)

  if (!record) {
    logger.warn(
      `Permission denied: user ${result.userId} with role ${role} lacks permission ${permissionCode}`
    )
    return {
      authenticated: true,
      userId: result.userId,
      role: result.role,
      error: 'api.common.permissionDenied',
    }
  }

  return result
}

/**
 * Check whether the current user has any one of the specified permissions
 */
export async function requireAnyPermission(permissionCodes: string[]): Promise<AuthCheckResult> {
  const result = await getCurrentUserRole()

  if (!result.authenticated) {
    return result
  }

  if (result.role === 'super_admin') {
    return result
  }

  const role = result.role ?? 'member'

  const records = await db
    .select({ permissionCode: platformRolePermissions.permissionCode })
    .from(platformRolePermissions)
    .where(eq(platformRolePermissions.role, role))

  const userPerms = new Set(records.map((r) => r.permissionCode))
  const hasAny = permissionCodes.some((code) => userPerms.has(code))

  if (!hasAny) {
    logger.warn(
      `Permission denied: user ${result.userId} with role ${role} lacks permissions [${permissionCodes.join(', ')}]`
    )
    return {
      authenticated: true,
      userId: result.userId,
      role: result.role,
      error: 'api.common.permissionDenied',
    }
  }

  return result
}

import { db } from '@crewmeld/db'
import { employeePlatformRoles, user as userTable } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth'
import type { AuthCheckResult, PlatformRole } from './types'

const logger = createLogger('RBAC:CheckRole')

/**
 * Get the identity and role of the current request user.
 * Retrieves user ID from Better Auth session first,
 * then queries the role from employee_platform_roles table.
 * Falls back to user.isSuperUser if no role record exists.
 */
export async function getCurrentUserRole(): Promise<AuthCheckResult> {
  const session = await getSession()
  if (!session?.user?.id) {
    return { authenticated: false, userId: null, role: null, error: 'api.common.unauthorized' }
  }

  const userId = session.user.id

  const [roleRecord] = await db
    .select()
    .from(employeePlatformRoles)
    .where(eq(employeePlatformRoles.userId, userId))
    .limit(1)

  if (roleRecord) {
    if (roleRecord.isDisabled) {
      return {
        authenticated: false,
        userId,
        role: roleRecord.role,
        error: 'api.common.accountDisabled',
      }
    }
    return { authenticated: true, userId, role: roleRecord.role, error: null }
  }

  const [userRecord] = await db
    .select({ isSuperUser: userTable.isSuperUser })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1)

  if (!userRecord) {
    return { authenticated: false, userId, role: null, error: 'api.common.userNotFound' }
  }

  const fallbackRole: PlatformRole = userRecord.isSuperUser ? 'super_admin' : 'member'
  return { authenticated: true, userId, role: fallbackRole, error: null }
}

/**
 * Verify the current user has the specified role (or higher privilege).
 * Role priority: super_admin > admin > member
 */
export async function requireRole(minimumRole: PlatformRole): Promise<AuthCheckResult> {
  const result = await getCurrentUserRole()

  if (!result.authenticated) {
    return result
  }

  const rolePriority: Record<PlatformRole, number> = {
    super_admin: 3,
    admin: 2,
    member: 1,
  }

  const userPriority = rolePriority[result.role ?? 'member']
  const requiredPriority = rolePriority[minimumRole]

  if (userPriority < requiredPriority) {
    logger.warn(
      `Insufficient role: user ${result.userId} has role ${result.role}, required ${minimumRole}`
    )
    return {
      authenticated: true,
      userId: result.userId,
      role: result.role,
      error:
        minimumRole === 'super_admin'
          ? 'api.common.requireRoleSuperAdmin'
          : 'api.common.requireRoleAdmin',
    }
  }

  return result
}

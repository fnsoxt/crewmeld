import { db } from '@crewmeld/db'
import { platformPermissionDefs, platformRolePermissions } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { getCurrentUserRole } from '@/lib/auth/rbac/check-role'

export const dynamic = 'force-dynamic'

const logger = createLogger('AuthPermissionsAPI')

/**
 * GET /api/employee/auth/permissions
 * Return the list of permission codes owned by the current user.
 * super_admin gets all permissions.
 */
export async function GET() {
  try {
    const result = await getCurrentUserRole()

    if (!result.authenticated) {
      return apiAuthErr(result)
    }

    // super_admin gets all permissions
    if (result.role === 'super_admin') {
      const allPerms = await db
        .select({ code: platformPermissionDefs.code })
        .from(platformPermissionDefs)

      return apiOk(null, {
        extra: {
          role: result.role,
          permissions: allPerms.map((p) => p.code),
        },
      })
    }

    const role = result.role ?? 'member'

    const records = await db
      .select({ permissionCode: platformRolePermissions.permissionCode })
      .from(platformRolePermissions)
      .where(eq(platformRolePermissions.role, role))

    return apiOk(null, {
      extra: {
        role: result.role,
        permissions: records.map((r) => r.permissionCode),
      },
    })
  } catch (error) {
    logger.error('Failed to fetch user permissions', error)
    return apiErr('api.auth.fetchPermissionsFailed', {
      status: 500,
      extra: { permissions: [] },
    })
  }
}

import { db } from '@crewmeld/db'
import { platformPermissionDefs, platformRolePermissions } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { asc } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/rbac/check-permission'

export const dynamic = 'force-dynamic'

const logger = createLogger('RolesAPI')

/**
 * GET /api/employee/settings/roles
 * Return all permission definitions + assigned permission codes per role
 */
export async function GET() {
  try {
    const authResult = await requirePermission('role:view')
    if (!authResult.authenticated || authResult.error) {
      const status = authResult.error === 'api.common.unauthorized' ? 401 : 403
      return NextResponse.json({ success: false, error: authResult.error }, { status })
    }

    // Query all permission definitions
    const allPermissions = await db
      .select()
      .from(platformPermissionDefs)
      .orderBy(asc(platformPermissionDefs.sortOrder), asc(platformPermissionDefs.code))

    // Query all role-permission associations
    const allRolePerms = await db
      .select({
        role: platformRolePermissions.role,
        permissionCode: platformRolePermissions.permissionCode,
      })
      .from(platformRolePermissions)

    // Group by role
    const roleMap: Record<string, string[]> = {
      super_admin: [],
      admin: [],
      member: [],
    }
    for (const rp of allRolePerms) {
      if (roleMap[rp.role]) {
        roleMap[rp.role].push(rp.permissionCode)
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        permissions: allPermissions,
        rolePermissions: roleMap,
      },
    })
  } catch (error) {
    logger.error('Failed to fetch roles', { error })
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

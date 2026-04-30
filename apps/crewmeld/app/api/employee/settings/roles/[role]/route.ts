import { db } from '@crewmeld/db'
import { platformPermissionDefs, platformRolePermissions } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import type { PlatformRole } from '@/lib/auth/rbac/types'

export const dynamic = 'force-dynamic'

const logger = createLogger('RolePermissionsAPI')

const VALID_ROLES: PlatformRole[] = ['super_admin', 'admin', 'member']

/**
 * PUT /api/employee/settings/roles/[role]
 * Update permissions for a specific role (full replacement)
 */
export async function PUT(request: Request, { params }: { params: Promise<{ role: string }> }) {
  try {
    const authResult = await requirePermission('role:edit')
    if (!authResult.authenticated || authResult.error) {
      return apiAuthErr(authResult)
    }

    const { role } = await params
    if (!VALID_ROLES.includes(role as PlatformRole)) {
      return apiErr('api.setting.invalidRole', { status: 400 })
    }

    const body = await request.json()
    const { permissionCodes } = body as { permissionCodes: string[] }

    if (!Array.isArray(permissionCodes)) {
      return apiErr('api.setting.permissionCodesMustBeArray', { status: 400 })
    }

    // Verify permission codes are valid
    if (permissionCodes.length > 0) {
      const validPerms = await db
        .select({ code: platformPermissionDefs.code })
        .from(platformPermissionDefs)
        .where(inArray(platformPermissionDefs.code, permissionCodes))

      const validCodes = new Set(validPerms.map((p) => p.code))
      const invalidCodes = permissionCodes.filter((c) => !validCodes.has(c))
      if (invalidCodes.length > 0) {
        return apiErr('api.setting.invalidPermissionCodes', {
          status: 400,
          params: { codes: invalidCodes.join(', ') },
        })
      }
    }

    // Transaction: delete old permissions + insert new ones
    await db.transaction(async (tx) => {
      await tx
        .delete(platformRolePermissions)
        .where(eq(platformRolePermissions.role, role as PlatformRole))

      if (permissionCodes.length > 0) {
        await tx.insert(platformRolePermissions).values(
          permissionCodes.map((code) => ({
            id: nanoid(),
            role: role as PlatformRole,
            permissionCode: code,
            createdBy: authResult.userId,
          }))
        )
      }
    })

    logger.info(`Updated permissions for role ${role}`, {
      count: permissionCodes.length,
      userId: authResult.userId,
    })

    return apiOk(null)
  } catch (error) {
    logger.error('Failed to update role permissions', { error })
    return apiErr('api.setting.updateRolePermissionsFailed', { status: 500 })
  }
}

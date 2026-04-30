import { db } from '@crewmeld/db'
import { employeePlatformRoles, user as userTable } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import type { PlatformRole } from '@/lib/auth/rbac/types'

const logger = createLogger('UserRoleAPI')

const VALID_ROLES: PlatformRole[] = ['super_admin', 'admin', 'member']

interface RouteContext {
  params: Promise<{ id: string }>
}

async function _PATCH(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await requirePermission('user:role_edit')
    if (!authResult.authenticated || authResult.error) {
      return apiAuthErr(authResult)
    }

    const { id: targetUserId } = await context.params

    if (targetUserId === authResult.userId) {
      return apiErr('api.user.cannotChangeOwnRole', { status: 400 })
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return apiErr('api.common.invalidBody', { status: 400 })
    }

    const newRole = body.role as string
    if (!newRole || !VALID_ROLES.includes(newRole as PlatformRole)) {
      return apiErr('api.user.roleInvalid', {
        status: 400,
        params: { roles: VALID_ROLES.join(', ') },
      })
    }

    const [targetUser] = await db
      .select({ id: userTable.id, isSuperUser: userTable.isSuperUser })
      .from(userTable)
      .where(eq(userTable.id, targetUserId))
      .limit(1)

    if (!targetUser) {
      return apiErr('api.user.notFound', { status: 404 })
    }

    await db.transaction(async (tx) => {
      const [existingRole] = await tx
        .select({ id: employeePlatformRoles.id })
        .from(employeePlatformRoles)
        .where(eq(employeePlatformRoles.userId, targetUserId))
        .limit(1)

      if (existingRole) {
        await tx
          .update(employeePlatformRoles)
          .set({
            role: newRole as PlatformRole,
            updatedAt: new Date(),
          })
          .where(eq(employeePlatformRoles.userId, targetUserId))
      } else {
        await tx.insert(employeePlatformRoles).values({
          id: `role-${nanoid(12)}`,
          userId: targetUserId,
          role: newRole as PlatformRole,
          isDisabled: false,
          createdBy: authResult.userId,
        })
      }

      const shouldBeSuperUser = newRole === 'super_admin'
      if (targetUser.isSuperUser !== shouldBeSuperUser) {
        await tx
          .update(userTable)
          .set({
            isSuperUser: shouldBeSuperUser,
            updatedAt: new Date(),
          })
          .where(eq(userTable.id, targetUserId))
      }
    })

    logger.info(`User role changed: ${targetUserId} -> ${newRole} (by ${authResult.userId})`)

    return apiOk({ userId: targetUserId, role: newRole })
  } catch (error) {
    logger.error('Failed to change user role', { error })
    return apiErr('api.user.updateRoleFailed', { status: 500 })
  }
}

export const PATCH = withAudit(_PATCH)

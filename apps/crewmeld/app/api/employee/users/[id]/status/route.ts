import { db } from '@crewmeld/db'
import { employeePlatformRoles, user as userTable } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'

const logger = createLogger('UserStatusAPI')

interface RouteContext {
  params: Promise<{ id: string }>
}

async function _PATCH(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await requirePermission('user:status_edit')
    if (!authResult.authenticated || authResult.error) {
      return apiAuthErr(authResult)
    }

    const { id: targetUserId } = await context.params

    if (targetUserId === authResult.userId) {
      return apiErr('api.user.cannotDisableSelf', { status: 400 })
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return apiErr('api.common.invalidBody', { status: 400 })
    }

    if (typeof body.isDisabled !== 'boolean') {
      return apiErr('api.user.isDisabledMustBeBoolean', { status: 400 })
    }

    const isDisabled = body.isDisabled

    const [targetUser] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.id, targetUserId))
      .limit(1)

    if (!targetUser) {
      return apiErr('api.user.notFound', { status: 404 })
    }

    const [existingRole] = await db
      .select({ id: employeePlatformRoles.id })
      .from(employeePlatformRoles)
      .where(eq(employeePlatformRoles.userId, targetUserId))
      .limit(1)

    if (existingRole) {
      await db
        .update(employeePlatformRoles)
        .set({
          isDisabled,
          updatedAt: new Date(),
        })
        .where(eq(employeePlatformRoles.userId, targetUserId))
    } else {
      await db.insert(employeePlatformRoles).values({
        id: `role-${nanoid(12)}`,
        userId: targetUserId,
        role: 'member',
        isDisabled,
        createdBy: authResult.userId,
      })
    }

    logger.info(
      `User status changed: ${targetUserId} isDisabled=${isDisabled} (by ${authResult.userId})`
    )

    return apiOk({ userId: targetUserId, isDisabled })
  } catch (error) {
    logger.error('Failed to change user status', { error })
    return apiErr('api.user.updateStatusFailed', { status: 500 })
  }
}

export const PATCH = withAudit(_PATCH)

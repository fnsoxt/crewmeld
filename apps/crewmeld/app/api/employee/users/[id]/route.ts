import { db } from '@crewmeld/db'
import { user as userTable } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'

export const dynamic = 'force-dynamic'

const logger = createLogger('UserDeleteAPI')

/**
 * DELETE /api/employee/users/[id]
 * Delete user (cascade delete sessions and related rows)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission('user:role_edit')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params

    // Cannot delete yourself
    if (id === auth.userId) {
      return apiErr('api.user.cannotDeleteSelf', { status: 400 })
    }

    // Check if user exists
    const [target] = await db
      .select({ id: userTable.id, name: userTable.name, isSuperUser: userTable.isSuperUser })
      .from(userTable)
      .where(eq(userTable.id, id))
      .limit(1)

    if (!target) {
      return apiErr('api.user.notFound', { status: 404 })
    }

    // Cannot delete super admin
    if (target.isSuperUser) {
      return apiErr('api.user.cannotDeleteSuperAdmin', { status: 400 })
    }

    // Delete user (related tables handled automatically via onDelete cascade/set null)
    await db.delete(userTable).where(eq(userTable.id, id))

    logger.info(`User deleted: ${target.name} (${id})`, { operatorId: auth.userId })

    return apiOk(null)
  } catch (error) {
    logger.error('Delete user failed', { error })
    return apiErr('api.user.deleteFailed', { status: 500 })
  }
}

import { db } from '@crewmeld/db'
import { user as userTable } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'

export const dynamic = 'force-dynamic'

const logger = createLogger('UserApprovalAPI')

const VALID_STATUSES = ['approved', 'rejected'] as const

/** PATCH /api/employee/users/[id]/approval — Approve/reject user */
async function _PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requirePermission('user:approval')
    if (!authResult.authenticated || authResult.error) {
      return apiAuthErr(authResult)
    }

    const { id: targetUserId } = await params

    if (targetUserId === authResult.userId) {
      return apiErr('api.user.cannotApproveSelf', { status: 400 })
    }

    const body = await request.json()
    const { status: newStatus } = body

    if (!VALID_STATUSES.includes(newStatus)) {
      return apiErr('api.user.approvalStatusInvalid', { status: 400 })
    }

    const [targetUser] = await db
      .select({ id: userTable.id, approvalStatus: userTable.approvalStatus })
      .from(userTable)
      .where(eq(userTable.id, targetUserId))
      .limit(1)

    if (!targetUser) {
      return apiErr('api.user.targetNotFound', { status: 404 })
    }

    if (newStatus === 'rejected') {
      // Reject registration -> delete user data directly (related tables auto-cleaned via cascade)
      await db.delete(userTable).where(eq(userTable.id, targetUserId))

      logger.info('User registration rejected and deleted', {
        targetUserId,
        rejectedBy: authResult.userId,
      })

      return apiOk(null, { extra: { approvalStatus: newStatus, deleted: true } })
    }

    await db
      .update(userTable)
      .set({ approvalStatus: newStatus })
      .where(eq(userTable.id, targetUserId))

    logger.info('User approval status updated', {
      targetUserId,
      newStatus,
      updatedBy: authResult.userId,
    })

    return apiOk(null, { extra: { approvalStatus: newStatus } })
  } catch (error) {
    logger.error('User approval failed', error)
    return apiErr('api.user.approveFailed', { status: 500 })
  }
}

export const PATCH = withAudit(_PATCH)

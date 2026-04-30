import { db } from '@crewmeld/db'
import {
  employeePlatformRoles,
  session as sessionTable,
  user as userTable,
} from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { desc, eq, max } from 'drizzle-orm'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import type { PlatformRole, PlatformUser } from '@/lib/auth/rbac/types'

export const dynamic = 'force-dynamic'

const logger = createLogger('UserListAPI')

export async function GET() {
  try {
    const authResult = await requirePermission('user:list')
    if (!authResult.authenticated || authResult.error) {
      return apiAuthErr(authResult)
    }

    const rows = await db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        image: userTable.image,
        isSuperUser: userTable.isSuperUser,
        approvalStatus: userTable.approvalStatus,
        createdAt: userTable.createdAt,
        role: employeePlatformRoles.role,
        isDisabled: employeePlatformRoles.isDisabled,
      })
      .from(userTable)
      .leftJoin(employeePlatformRoles, eq(userTable.id, employeePlatformRoles.userId))
      .orderBy(desc(userTable.createdAt))

    const userMap = new Map<string, PlatformUser>()

    for (const row of rows) {
      const derivedRole: PlatformRole = row.role ?? (row.isSuperUser ? 'super_admin' : 'member')

      const candidate: PlatformUser = {
        id: row.id,
        name: row.name,
        email: row.email,
        image: row.image,
        role: derivedRole,
        isDisabled: row.isDisabled ?? false,
        isSuperUser: row.isSuperUser,
        approvalStatus: (row.approvalStatus as PlatformUser['approvalStatus']) ?? 'approved',
        lastLoginAt: null,
        createdAt: row.createdAt.toISOString(),
      }

      userMap.set(row.id, candidate)
    }

    // Query each user's last session activity from session table
    const sessionLastActive = await db
      .select({
        userId: sessionTable.userId,
        lastActive: max(sessionTable.updatedAt).as('last_active'),
      })
      .from(sessionTable)
      .groupBy(sessionTable.userId)

    const sessionMap = new Map(sessionLastActive.map((s) => [s.userId, s.lastActive]))

    // lastLoginAt comes from session.lastActive
    for (const [userId, u] of userMap) {
      u.lastLoginAt = sessionMap.get(userId)?.toISOString() ?? null
    }

    const data = Array.from(userMap.values())

    logger.info(`Fetched ${data.length} platform users`)

    return apiOk(data)
  } catch (error) {
    logger.error('Failed to fetch users', { error })
    return apiErr('api.user.fetchListFailed', { status: 500 })
  }
}

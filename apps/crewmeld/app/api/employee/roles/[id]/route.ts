import { db } from '@crewmeld/db'
import { roles } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { isBuiltinRoleId } from '@/data/builtin-roles'

const logger = createLogger('RoleByIdAPI')

/** DELETE /api/employee/roles/[id] — delete a role by id */
async function _DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('employee:delete')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params

    if (isBuiltinRoleId(id)) {
      return apiErr('api.template.builtinRoleCannotDelete', { status: 403 })
    }

    const [existing] = await db
      .select({ id: roles.id, name: roles.name })
      .from(roles)
      .where(eq(roles.id, id))
      .limit(1)

    if (!existing) {
      return apiErr('api.role.notFound', { status: 404, params: { id } })
    }

    await db.delete(roles).where(eq(roles.id, id))

    logger.info(`Role deleted: ${id}`)

    return apiOk({ id, name: existing.name })
  } catch (error) {
    logger.error('Failed to delete role', error)
    return apiErr('api.role.deleteFailed', { status: 500 })
  }
}

export const DELETE = withAudit(_DELETE)

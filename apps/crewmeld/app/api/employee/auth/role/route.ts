import { createLogger } from '@crewmeld/logger'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { getCurrentUserRole } from '@/lib/auth/rbac/check-role'

const logger = createLogger('AuthRoleAPI')

export async function GET() {
  try {
    const result = await getCurrentUserRole()

    if (!result.authenticated) {
      return apiAuthErr(result)
    }

    const isAdmin = result.role === 'admin' || result.role === 'super_admin'

    return apiOk(null, {
      extra: {
        role: result.role,
        isAdmin,
        userId: result.userId,
      },
    })
  } catch (error) {
    logger.error('Failed to fetch user role', error)
    return apiErr('api.auth.fetchRoleFailed', {
      status: 500,
      extra: { role: null, isAdmin: false },
    })
  }
}

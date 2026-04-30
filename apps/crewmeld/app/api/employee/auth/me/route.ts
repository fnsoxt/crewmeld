import { apiAuthErr, apiOk } from '@/lib/api/response'
import { getCurrentUserRole } from '@/lib/auth/rbac/check-role'

export const dynamic = 'force-dynamic'

export async function GET() {
  const result = await getCurrentUserRole()

  if (!result.authenticated) {
    return apiAuthErr(result)
  }

  return apiOk({ userId: result.userId, role: result.role })
}

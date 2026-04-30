import { db } from '@crewmeld/db'
import { user } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import { apiErr, apiOk } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

const logger = createLogger('SetupStatus')

export async function GET() {
  try {
    const superUsers = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.isSuperUser, true))
      .limit(1)

    return apiOk({ initialized: superUsers.length > 0 })
  } catch (error) {
    logger.error('Failed to query setup status', { error })
    return apiErr('api.system.setupStatusQueryFailed', { status: 500 })
  }
}

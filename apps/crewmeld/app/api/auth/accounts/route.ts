import { db } from '@crewmeld/db'
import { account } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

const logger = createLogger('AuthAccountsAPI')

/** Return the connected OAuth accounts for the current session user. */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const userEmail = session.user.email

  try {
    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider')

    // Build conditions: always filter by userId, optionally by providerId.
    const conditions = provider
      ? [eq(account.userId, userId), eq(account.providerId, provider)]
      : [eq(account.userId, userId)]

    const rows = await db
      .select({
        id: account.id,
        accountId: account.accountId,
        providerId: account.providerId,
      })
      .from(account)
      .where(and(...conditions))

    // Use the session email as display name for consistency with the credential selector.
    const accounts = rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      providerId: row.providerId,
      displayName: userEmail ?? row.providerId,
    }))

    return NextResponse.json({ accounts })
  } catch (err) {
    logger.error('Failed to fetch accounts', { error: err })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

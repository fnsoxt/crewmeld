import { db } from '@crewmeld/db'
import { account } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { env } from '@/lib/core/config/env'
import { safeAccountInsert } from '@/app/api/auth/oauth/utils'

const logger = createLogger('TrelloStore')

export const dynamic = 'force-dynamic'

/** Validate a Trello token by fetching the authenticated member profile. */
async function fetchTrelloMember(
  apiKey: string,
  token: string
): Promise<{ id: string; username: string } | null> {
  const url = `https://api.trello.com/1/members/me?key=${apiKey}&token=${token}&fields=id,username,fullName,email`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })

  if (!res.ok) {
    const errText = await res.text()
    logger.error('Invalid Trello token', { status: res.status, error: errText })
    return null
  }

  return res.json() as Promise<{ id: string; username: string }>
}

/** Store (or update) a Trello access token for the authenticated user. */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn('Unauthorized attempt to store Trello token')
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    const body = (await request.json()) as Record<string, unknown>
    const token = typeof body.token === 'string' ? body.token : null

    if (!token) {
      return NextResponse.json({ success: false, error: 'Token required' }, { status: 400 })
    }

    const apiKey = env.TRELLO_API_KEY
    if (!apiKey) {
      logger.error('TRELLO_API_KEY not configured')
      return NextResponse.json({ success: false, error: 'Trello not configured' }, { status: 500 })
    }

    const trelloUser = await fetchTrelloMember(apiKey, token)
    if (!trelloUser) {
      return NextResponse.json({ success: false, error: 'Invalid Trello token' }, { status: 400 })
    }

    const now = new Date()

    const existing = await db.query.account.findFirst({
      where: and(eq(account.userId, userId), eq(account.providerId, 'trello')),
    })

    if (existing) {
      await db
        .update(account)
        .set({ accessToken: token, accountId: trelloUser.id, scope: 'read,write', updatedAt: now })
        .where(eq(account.id, existing.id))
    } else {
      await safeAccountInsert(
        {
          id: `trello_${userId}_${Date.now()}`,
          userId,
          providerId: 'trello',
          accountId: trelloUser.id,
          accessToken: token,
          scope: 'read,write',
          createdAt: now,
          updatedAt: now,
        },
        { provider: 'Trello', identifier: trelloUser.id }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('Error storing Trello token', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

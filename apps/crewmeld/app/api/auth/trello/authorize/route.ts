import { createLogger } from '@crewmeld/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { env } from '@/lib/core/config/env'
import { getBaseUrl } from '@/lib/core/utils/urls'

const logger = createLogger('TrelloAuthorize')

export const dynamic = 'force-dynamic'

/** Trello OAuth parameters shared across all authorize requests. */
const TRELLO_AUTH_PARAMS = {
  name: 'CrewMeld',
  expiration: 'never',
  response_type: 'token',
  scope: 'read,write',
} as const

/** Redirect the authenticated user to the Trello consent screen. */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = env.TRELLO_API_KEY
    if (!apiKey) {
      logger.error('TRELLO_API_KEY not configured')
      return NextResponse.json({ error: 'Trello API key not configured' }, { status: 500 })
    }

    const baseUrl = getBaseUrl()
    const callbackUrl = `${baseUrl}/api/auth/trello/callback`

    const authUrl = new URL('https://trello.com/1/authorize')
    authUrl.searchParams.set('key', apiKey)
    authUrl.searchParams.set('return_url', callbackUrl)

    for (const [key, value] of Object.entries(TRELLO_AUTH_PARAMS)) {
      authUrl.searchParams.set(key, value)
    }

    return NextResponse.redirect(authUrl.toString())
  } catch (err) {
    logger.error('Error initiating Trello authorization', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

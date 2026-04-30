import { db } from '@crewmeld/db'
import { account } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { generateRequestId } from '@/lib/core/utils/request'
import { refreshAccessTokenIfNeeded } from '@/app/api/auth/oauth/utils'

export const dynamic = 'force-dynamic'

const logger = createLogger('WealthboxItemsAPI')

const WEALTHBOX_BASE = 'https://api.crmworkspace.com/v1'
const ENDPOINT_BY_TYPE = { contact: 'contacts' } as const
type SupportedType = keyof typeof ENDPOINT_BY_TYPE

/** Shape a raw Wealthbox contact record into the normalised item. */
function toContactItem(raw: Record<string, unknown>) {
  const firstName = (raw.first_name as string | undefined) ?? ''
  const lastName = (raw.last_name as string | undefined) ?? ''
  return {
    id: String(raw.id ?? ''),
    name: `${firstName} ${lastName}`.trim() || `Contact ${raw.id}`,
    type: 'contact',
    content: (raw.background_information as string | undefined) ?? '',
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

/** List items from Wealthbox, with optional client-side text filter. */
export async function GET(request: NextRequest) {
  const requestId = generateRequestId()

  const session = await getSession()
  if (!session?.user?.id) {
    logger.warn(`[${requestId}] Unauthenticated request rejected`)
    return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { searchParams } = new URL(request.url)
    const credentialId = searchParams.get('credentialId')
    const type = searchParams.get('type') ?? 'contact'
    const query = searchParams.get('query') ?? ''

    if (!credentialId) {
      logger.warn(`[${requestId}] Missing credential ID`)
      return NextResponse.json({ error: 'Credential ID is required' }, { status: 400 })
    }

    if (!(type in ENDPOINT_BY_TYPE)) {
      logger.warn(`[${requestId}] Unsupported item type: ${type}`)
      return NextResponse.json(
        { error: 'Invalid item type. Only contact is supported.' },
        { status: 400 }
      )
    }

    const rows = await db.select().from(account).where(eq(account.id, credentialId)).limit(1)
    if (!rows.length) {
      logger.warn(`[${requestId}] Credential not found`, { credentialId })
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 })
    }

    const credential = rows[0]
    if (credential.userId !== userId) {
      logger.warn(`[${requestId}] Credential ownership mismatch`, {
        credentialUserId: credential.userId,
        requestUserId: userId,
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const accessToken = await refreshAccessTokenIfNeeded(credentialId, userId, requestId)
    if (!accessToken) {
      logger.error(`[${requestId}] Failed to obtain access token`)
      return NextResponse.json({ error: 'Failed to obtain valid access token' }, { status: 401 })
    }

    const endpoint = ENDPOINT_BY_TYPE[type as SupportedType]
    const apiUrl = new URL(`${WEALTHBOX_BASE}/${endpoint}`)

    logger.info(`[${requestId}] Fetching ${type}s from Wealthbox`, {
      endpoint,
      url: apiUrl.toString(),
      hasQuery: !!query.trim(),
    })

    const upstream = await fetch(apiUrl.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!upstream.ok) {
      const body = await upstream.text()
      logger.error(`[${requestId}] Wealthbox API error ${upstream.status}`, {
        error: body,
        endpoint,
        url: apiUrl.toString(),
      })
      return NextResponse.json(
        { error: `Failed to fetch ${type}s from Wealthbox` },
        { status: upstream.status }
      )
    }

    const data = (await upstream.json()) as Record<string, unknown>
    logger.info(`[${requestId}] Wealthbox response received`, {
      type,
      status: upstream.status,
      dataKeys: Object.keys(data),
    })

    const rawContacts = data.contacts
    if (!Array.isArray(rawContacts)) {
      logger.warn(`[${requestId}] Contacts field is not an array`, { type: typeof rawContacts })
      return NextResponse.json({ items: [] })
    }

    let items = rawContacts.map((c) => toContactItem(c as Record<string, unknown>))

    const searchTerm = query.trim().toLowerCase()
    if (searchTerm) {
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(searchTerm) ||
          item.content.toLowerCase().includes(searchTerm)
      )
    }

    logger.info(`[${requestId}] Returning ${items.length} ${type}(s)`, {
      hasFilter: !!searchTerm,
    })

    return NextResponse.json({ items })
  } catch (err) {
    logger.error(`[${requestId}] Error fetching Wealthbox items`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

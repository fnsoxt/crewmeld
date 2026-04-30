import { db } from '@crewmeld/db'
import { account } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { validateEnum, validatePathSegment } from '@/lib/core/security/input-validation'
import { generateRequestId } from '@/lib/core/utils/request'
import { refreshAccessTokenIfNeeded } from '@/app/api/auth/oauth/utils'

export const dynamic = 'force-dynamic'

const logger = createLogger('WealthboxItemAPI')

/** API base URL for Wealthbox CRM. */
const WEALTHBOX_BASE = 'https://api.crmworkspace.com/v1'

/** Map supported item types to their Wealthbox endpoint segment. */
const ENDPOINT_BY_TYPE = { contact: 'contacts' } as const
type SupportedType = keyof typeof ENDPOINT_BY_TYPE

/** Shape a raw Wealthbox contact record into the normalised item. */
function toContactItem(raw: Record<string, unknown>) {
  const firstName = (raw.first_name as string | undefined) ?? ''
  const lastName = (raw.last_name as string | undefined) ?? ''
  const displayName = `${firstName} ${lastName}`.trim() || `Contact ${raw.id}`
  return {
    id: String(raw.id ?? ''),
    name: displayName,
    type: 'contact',
    content: (raw.background_info as string | undefined) ?? '',
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

/** Fetch a single item from Wealthbox by type and ID. */
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
    const itemId = searchParams.get('itemId')
    const type = searchParams.get('type') ?? 'contact'

    if (!credentialId || !itemId) {
      logger.warn(`[${requestId}] Missing required parameters`, { credentialId, itemId })
      return NextResponse.json({ error: 'Credential ID and Item ID are required' }, { status: 400 })
    }

    const typeCheck = validateEnum(type, ['contact'] as const, 'type')
    if (!typeCheck.isValid) {
      logger.warn(`[${requestId}] Invalid item type: ${typeCheck.error}`)
      return NextResponse.json({ error: typeCheck.error }, { status: 400 })
    }

    const itemIdCheck = validatePathSegment(itemId, {
      paramName: 'itemId',
      maxLength: 100,
      allowHyphens: true,
      allowUnderscores: true,
      allowDots: false,
    })
    if (!itemIdCheck.isValid) {
      logger.warn(`[${requestId}] Invalid item ID: ${itemIdCheck.error}`)
      return NextResponse.json({ error: itemIdCheck.error }, { status: 400 })
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
    logger.info(`[${requestId}] Fetching ${type} ${itemId} from Wealthbox`)

    const upstream = await fetch(`${WEALTHBOX_BASE}/${endpoint}/${itemId}`, {
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
        itemId,
      })
      if (upstream.status === 404) {
        return NextResponse.json({ error: 'Item not found' }, { status: 404 })
      }
      return NextResponse.json(
        { error: `Failed to fetch ${type} from Wealthbox` },
        { status: upstream.status }
      )
    }

    const data = (await upstream.json()) as Record<string, unknown>
    logger.info(`[${requestId}] Wealthbox response received`, {
      type,
      dataKeys: Object.keys(data),
      totalCount: (data.meta as Record<string, unknown> | undefined)?.total_count,
    })

    if (!data?.id) {
      logger.warn(`[${requestId}] Unexpected contact response shape`, { data })
      return NextResponse.json({ item: undefined })
    }

    return NextResponse.json({ item: toContactItem(data) })
  } catch (err) {
    logger.error(`[${requestId}] Error fetching Wealthbox item`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

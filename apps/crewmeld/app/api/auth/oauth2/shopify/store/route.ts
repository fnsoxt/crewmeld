import { db } from '@crewmeld/db'
import { account } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getBaseUrl } from '@/lib/core/utils/urls'
import { safeAccountInsert } from '@/app/api/auth/oauth/utils'

const logger = createLogger('ShopifyStore')

export const dynamic = 'force-dynamic'

/** Persist (or update) the Shopify access token after a successful OAuth flow. */
export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl()

  const session = await getSession()
  if (!session?.user?.id) {
    logger.warn('Unauthorized attempt to store Shopify token')
    return NextResponse.redirect(`${baseUrl}/workspace?error=unauthorized`)
  }

  const userId = session.user.id

  try {
    const accessToken = request.cookies.get('shopify_pending_token')?.value
    const shopDomain = request.cookies.get('shopify_pending_shop')?.value
    const scope = request.cookies.get('shopify_pending_scope')?.value

    if (!accessToken || !shopDomain) {
      logger.error('Missing token or shop domain in pending cookies')
      return NextResponse.redirect(`${baseUrl}/workspace?error=shopify_missing_data`)
    }

    const shopRes = await fetch(`https://${shopDomain}/admin/api/2024-10/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    })

    if (!shopRes.ok) {
      const errText = await shopRes.text()
      logger.error('Invalid Shopify token during store step', {
        status: shopRes.status,
        error: errText,
      })
      return NextResponse.redirect(`${baseUrl}/workspace?error=shopify_invalid_token`)
    }

    const shopData = (await shopRes.json()) as Record<string, unknown>
    const shopInfo = shopData.shop as Record<string, unknown> | undefined

    const now = new Date()
    const accountId = String(shopInfo?.id ?? shopDomain)

    const existing = await db.query.account.findFirst({
      where: and(eq(account.userId, userId), eq(account.providerId, 'shopify')),
    })

    if (existing) {
      await db
        .update(account)
        .set({ accessToken, accountId, scope: scope ?? '', updatedAt: now, idToken: shopDomain })
        .where(eq(account.id, existing.id))
      logger.info('Updated existing Shopify account', { accountId: existing.id })
    } else {
      await safeAccountInsert(
        {
          id: `shopify_${userId}_${Date.now()}`,
          userId,
          providerId: 'shopify',
          accountId,
          accessToken,
          scope: scope ?? '',
          idToken: shopDomain,
          createdAt: now,
          updatedAt: now,
        },
        { provider: 'Shopify', identifier: shopDomain }
      )
    }

    const returnUrl = request.cookies.get('shopify_return_url')?.value
    const finalUrl = new URL(returnUrl ?? `${baseUrl}/workspace`)
    finalUrl.searchParams.set('shopify_connected', 'true')

    const response = NextResponse.redirect(finalUrl.toString())
    response.cookies.delete('shopify_pending_token')
    response.cookies.delete('shopify_pending_shop')
    response.cookies.delete('shopify_pending_scope')
    response.cookies.delete('shopify_return_url')

    return response
  } catch (err) {
    logger.error('Error storing Shopify token', err)
    return NextResponse.redirect(`${baseUrl}/workspace?error=shopify_store_error`)
  }
}

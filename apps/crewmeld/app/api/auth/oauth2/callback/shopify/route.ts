import crypto from 'crypto'
import { createLogger } from '@crewmeld/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { env } from '@/lib/core/config/env'
import { getBaseUrl } from '@/lib/core/utils/urls'

const logger = createLogger('ShopifyCallback')

export const dynamic = 'force-dynamic'

const SHOP_DOMAIN_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/

/** Verify the Shopify HMAC signature to ensure the callback is authentic. */
function isHmacValid(params: URLSearchParams, clientSecret: string): boolean {
  const hmac = params.get('hmac')
  if (!hmac) return false

  const payload: Record<string, string> = {}
  params.forEach((value, key) => {
    if (key !== 'hmac') payload[key] = value
  })

  const message = Object.keys(payload)
    .sort()
    .map((k) => `${k}=${payload[k]}`)
    .join('&')

  const expected = crypto.createHmac('sha256', clientSecret).update(message).digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

/** Handle the OAuth callback from Shopify, exchange code for access token. */
export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl()

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.redirect(`${baseUrl}/workspace?error=unauthorized`)
    }

    const { searchParams } = request.nextUrl
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const shop = searchParams.get('shop')

    const storedState = request.cookies.get('shopify_oauth_state')?.value
    const storedShop = request.cookies.get('shopify_shop_domain')?.value

    const clientId = env.SHOPIFY_CLIENT_ID
    const clientSecret = env.SHOPIFY_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      logger.error('Shopify credentials not configured')
      return NextResponse.redirect(`${baseUrl}/workspace?error=shopify_config_error`)
    }

    if (!isHmacValid(searchParams, clientSecret)) {
      logger.error('HMAC validation failed in Shopify OAuth callback')
      return NextResponse.redirect(`${baseUrl}/workspace?error=shopify_hmac_invalid`)
    }

    if (!state || state !== storedState) {
      logger.error('State mismatch in Shopify OAuth callback')
      return NextResponse.redirect(`${baseUrl}/workspace?error=shopify_state_mismatch`)
    }

    if (!code) {
      logger.error('No code received from Shopify')
      return NextResponse.redirect(`${baseUrl}/workspace?error=shopify_no_code`)
    }

    const shopDomain = shop ?? storedShop
    if (!shopDomain) {
      logger.error('No shop domain available')
      return NextResponse.redirect(`${baseUrl}/workspace?error=shopify_no_shop`)
    }

    if (!SHOP_DOMAIN_REGEX.test(shopDomain)) {
      logger.error('Invalid shop domain format', { shopDomain })
      return NextResponse.redirect(`${baseUrl}/workspace?error=shopify_invalid_shop`)
    }

    const tokenRes = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    })

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text()
      logger.error('Failed to exchange Shopify code for token', {
        status: tokenRes.status,
        body: errBody,
      })
      return NextResponse.redirect(`${baseUrl}/workspace?error=shopify_token_error`)
    }

    const tokenData = (await tokenRes.json()) as Record<string, unknown>
    const accessToken = tokenData.access_token as string | undefined
    const scope = tokenData.scope as string | undefined

    logger.info('Shopify token exchange successful', { hasAccessToken: !!accessToken, scope })

    if (!accessToken) {
      logger.error('No access token in Shopify token response')
      return NextResponse.redirect(`${baseUrl}/workspace?error=shopify_no_token`)
    }

    const storeUrl = new URL(`${baseUrl}/api/auth/oauth2/shopify/store`)
    const isProduction = process.env.NODE_ENV === 'production'
    const cookieBase = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      maxAge: 60,
      path: '/',
    }

    const response = NextResponse.redirect(storeUrl)
    response.cookies.set('shopify_pending_token', accessToken, cookieBase)
    response.cookies.set('shopify_pending_shop', shopDomain, cookieBase)
    response.cookies.set('shopify_pending_scope', scope ?? '', cookieBase)
    response.cookies.delete('shopify_oauth_state')
    response.cookies.delete('shopify_shop_domain')

    return response
  } catch (err) {
    logger.error('Error in Shopify OAuth callback', err)
    return NextResponse.redirect(`${baseUrl}/workspace?error=shopify_callback_error`)
  }
}

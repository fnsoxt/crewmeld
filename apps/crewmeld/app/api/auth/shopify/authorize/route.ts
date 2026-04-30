import { createLogger } from '@crewmeld/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { env } from '@/lib/core/config/env'
import { getBaseUrl } from '@/lib/core/utils/urls'

const logger = createLogger('ShopifyAuthorize')

export const dynamic = 'force-dynamic'

/** All scopes required by the CrewMeld Shopify integration. */
const SHOPIFY_SCOPES = [
  'write_products',
  'write_orders',
  'write_customers',
  'write_inventory',
  'read_locations',
  'write_merchant_managed_fulfillment_orders',
].join(',')

/** Normalise a raw shop domain input to a canonical `*.myshopify.com` hostname. */
function normalizeShopDomain(raw: string): string {
  let domain = raw
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
  if (!domain.endsWith('.myshopify.com')) {
    domain = `${domain.replace(/\.myshopify\.com$/, '')}.myshopify.com`
  }
  return domain
}

/** Inline HTML form that lets the user enter their Shopify store domain. */
function buildDomainInputPage(returnUrlParam: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <title>Connect Shopify Store</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        margin: 0;
        background: linear-gradient(135deg, #96BF48 0%, #5C8A23 100%);
      }
      .container {
        background: white;
        padding: 2rem;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        text-align: center;
        max-width: 400px;
        width: 90%;
      }
      h2 { color: #111827; margin: 0 0 0.5rem 0; }
      p { color: #6b7280; margin: 0 0 1.5rem 0; }
      input {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        font-size: 1rem;
        margin-bottom: 1rem;
        box-sizing: border-box;
      }
      input:focus {
        outline: none;
        border-color: #96BF48;
        box-shadow: 0 0 0 3px rgba(150, 191, 72, 0.2);
      }
      button {
        width: 100%;
        padding: 0.75rem;
        background: #96BF48;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 1rem;
        cursor: pointer;
        font-weight: 500;
      }
      button:hover { background: #7FA93D; }
      .help { font-size: 0.875rem; color: #9ca3af; margin-top: 1rem; }
    </style>
  </head>
  <body>
    <div class="container">
      <h2>Connect Your Shopify Store</h2>
      <p>Enter your Shopify store domain to continue</p>
      <form onsubmit="handleSubmit(event)">
        <input
          type="text"
          id="shop"
          placeholder="mystore.myshopify.com"
          required
          pattern="[a-zA-Z0-9-]+\\.myshopify\\.com"
        />
        <button type="submit">Connect Store</button>
      </form>
      <p class="help">Your store domain looks like: yourstore.myshopify.com</p>
    </div>

    <script>
      const returnUrl = '${returnUrlParam}';
      function handleSubmit(e) {
        e.preventDefault();
        let shop = document.getElementById('shop').value.trim().toLowerCase();
        shop = shop.replace('https://', '').replace('http://', '');
        if (!shop.endsWith('.myshopify.com')) {
          shop = shop.replace('.myshopify.com', '') + '.myshopify.com';
        }
        let url = window.location.pathname + '?shop=' + encodeURIComponent(shop);
        if (returnUrl) { url += '&returnUrl=' + returnUrl; }
        window.location.href = url;
      }
    </script>
  </body>
</html>`
}

/** Initiate Shopify OAuth — redirect to store's consent page or show domain form. */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const clientId = env.SHOPIFY_CLIENT_ID
    if (!clientId) {
      logger.error('SHOPIFY_CLIENT_ID not configured')
      return NextResponse.json({ error: 'Shopify client ID not configured' }, { status: 500 })
    }

    const { searchParams } = request.nextUrl
    const shopDomain = searchParams.get('shop')
    const returnUrl = searchParams.get('returnUrl')

    // No shop domain — render the domain input form.
    if (!shopDomain) {
      const encodedReturn = returnUrl ? encodeURIComponent(returnUrl) : ''
      return new NextResponse(buildDomainInputPage(encodedReturn), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      })
    }

    const cleanShop = normalizeShopDomain(shopDomain)
    const baseUrl = getBaseUrl()
    const redirectUri = `${baseUrl}/api/auth/oauth2/callback/shopify`
    const state = crypto.randomUUID()

    const oauthUrl =
      `https://${cleanShop}/admin/oauth/authorize?` +
      new URLSearchParams({
        client_id: clientId,
        scope: SHOPIFY_SCOPES,
        redirect_uri: redirectUri,
        state,
      }).toString()

    logger.info('Initiating Shopify OAuth', {
      shop: cleanShop,
      requestedScopes: SHOPIFY_SCOPES,
      redirectUri,
      returnUrl: returnUrl ?? 'not specified',
    })

    const isProduction = process.env.NODE_ENV === 'production'
    const cookieBase = { httpOnly: true, secure: isProduction, sameSite: 'lax' as const, path: '/' }

    const response = NextResponse.redirect(oauthUrl)
    response.cookies.set('shopify_oauth_state', state, { ...cookieBase, maxAge: 60 * 10 })
    response.cookies.set('shopify_shop_domain', cleanShop, { ...cookieBase, maxAge: 60 * 10 })

    if (returnUrl) {
      response.cookies.set('shopify_return_url', returnUrl, { ...cookieBase, maxAge: 60 * 10 })
    }

    return response
  } catch (err) {
    logger.error('Error initiating Shopify authorization', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

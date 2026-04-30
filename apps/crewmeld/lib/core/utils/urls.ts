import { getEnv } from '@/lib/core/config/env'
import { isProd } from '@/lib/core/config/feature-flags'

function hasHttpProtocol(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

function normalizeBaseUrl(url: string): string {
  if (hasHttpProtocol(url)) {
    return url
  }

  const protocol = isProd ? 'https://' : 'http://'
  return `${protocol}${url}`
}

/**
 * Returns the base URL of the application from NEXT_PUBLIC_APP_URL
 * This ensures webhooks, callbacks, and other integrations always use the correct public URL
 * @returns The base URL string (e.g., 'http://localhost:6100' or 'https://example.com')
 * @throws Error if NEXT_PUBLIC_APP_URL is not configured
 */
export function getBaseUrl(): string {
  // getEnv depends on next-runtime-env and may not be injected yet when evaluated at the top level of client modules,
  // in which case fall back to process.env (Next.js inlines NEXT_PUBLIC_ variables at build time).
  const baseUrl = (getEnv('NEXT_PUBLIC_APP_URL') ?? process.env.NEXT_PUBLIC_APP_URL)?.trim()

  if (!baseUrl) {
    throw new Error(
      'NEXT_PUBLIC_APP_URL must be configured for webhooks and callbacks to work correctly'
    )
  }

  return normalizeBaseUrl(baseUrl)
}

/**
 * Returns the base URL used by server-side internal API calls.
 * Falls back to NEXT_PUBLIC_APP_URL when INTERNAL_API_BASE_URL is not set.
 */
export function getInternalApiBaseUrl(): string {
  const internalBaseUrl = getEnv('INTERNAL_API_BASE_URL')?.trim()
  if (!internalBaseUrl) {
    return getBaseUrl()
  }

  if (!hasHttpProtocol(internalBaseUrl)) {
    throw new Error(
      'INTERNAL_API_BASE_URL must include protocol (http:// or https://), e.g. http://crewmeld-app.default.svc.cluster.local:6100'
    )
  }

  return internalBaseUrl
}

/**
 * Ensures a URL is absolute by prefixing the base URL when a relative path is provided.
 * @param pathOrUrl - Relative path (e.g., /api/files/serve/...) or absolute URL
 */
export function ensureAbsoluteUrl(pathOrUrl: string): string {
  if (!pathOrUrl) {
    throw new Error('URL is required')
  }

  if (pathOrUrl.startsWith('/')) {
    return `${getBaseUrl()}${pathOrUrl}`
  }

  return pathOrUrl
}

/**
 * Returns just the domain and port part of the application URL
 * @returns The domain with port if applicable (e.g., 'localhost:6100' or 'crewmeld.com')
 */
export function getBaseDomain(): string {
  try {
    const url = new URL(getBaseUrl())
    return url.host // host includes port if specified
  } catch (_e) {
    const fallbackUrl = getEnv('NEXT_PUBLIC_APP_URL') || 'http://localhost:6100'
    try {
      return new URL(fallbackUrl).host
    } catch {
      return 'localhost:6100'
    }
  }
}

/**
 * Returns the domain for email addresses, stripping www subdomain for Resend compatibility
 * @returns The email domain (e.g., 'crewmeld.ai' instead of 'www.crewmeld.ai')
 */
export function getEmailDomain(): string {
  try {
    const baseDomain = getBaseDomain()
    return baseDomain.startsWith('www.') ? baseDomain.substring(4) : baseDomain
  } catch (_e) {
    return 'localhost:6100'
  }
}

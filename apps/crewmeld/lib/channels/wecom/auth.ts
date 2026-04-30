import { createLogger } from '@crewmeld/logger'
import { getWeComErrorMessage } from '@/lib/channels/wecom/errors'

const logger = createLogger('WeComAuth')

interface TokenCacheEntry {
  accessToken: string
  expiresAt: number
}

const tokenCache = new Map<string, TokenCacheEntry>()

/** Access token refresh margin (seconds), to avoid edge-case expiration */
const TOKEN_REFRESH_MARGIN_SECS = 300

/**
 * Get WeCom Access Token
 *
 * WeCom access_token is valid for 7200 seconds (2 hours).
 * Uses in-memory cache, auto-refreshes 5 minutes before expiration.
 *
 * @param corpId - Corp ID
 * @param corpSecret - App credential secret
 * @returns access_token string
 */
export async function getWeComAccessToken(corpId: string, corpSecret: string): Promise<string> {
  const cacheKey = `${corpId}:${corpSecret}`
  const cached = tokenCache.get(cacheKey)

  if (cached && cached.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_SECS * 1000) {
    logger.info('Using cached access token')
    return cached.accessToken
  }

  logger.info('Fetching new access token', { corpId })

  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(corpSecret)}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)

  try {
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP request failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as {
      errcode: number
      errmsg: string
      access_token?: string
      expires_in?: number
    }

    if (data.errcode !== 0 || !data.access_token) {
      const errorMsg = getWeComErrorMessage(data.errcode, data.errmsg)
      throw new Error(`Failed to get Access Token: ${errorMsg}`)
    }

    const entry: TokenCacheEntry = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
    }

    tokenCache.set(cacheKey, entry)
    logger.info('Access token obtained successfully', { expiresIn: data.expires_in })

    return data.access_token
  } catch (error) {
    clearTimeout(timeoutId)

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Access Token request timed out, please check network connection')
    }

    throw error
  }
}

/**
 * Clear Access Token cache for a specific corp (for forced refresh when token becomes invalid)
 */
export function clearWeComTokenCache(corpId: string, corpSecret: string): void {
  const cacheKey = `${corpId}:${corpSecret}`
  tokenCache.delete(cacheKey)
  logger.info('Access token cache cleared', { corpId })
}

/**
 * WeCom API call with auto-retry
 * When error code 42001 (access_token expired) is returned, automatically clears cache and retries once
 */
export async function callWeComApiWithRetry<T>(
  corpId: string,
  corpSecret: string,
  apiCall: (accessToken: string) => Promise<T & { errcode: number; errmsg: string }>
): Promise<T & { errcode: number; errmsg: string }> {
  const accessToken = await getWeComAccessToken(corpId, corpSecret)
  const result = await apiCall(accessToken)

  if (result.errcode === 42001 || result.errcode === 40014) {
    logger.warn('Access token expired, re-fetching', { errcode: result.errcode })
    clearWeComTokenCache(corpId, corpSecret)

    const newAccessToken = await getWeComAccessToken(corpId, corpSecret)
    return apiCall(newAccessToken)
  }

  return result
}

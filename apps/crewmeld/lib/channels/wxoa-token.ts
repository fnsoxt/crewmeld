/**
 * WeChat Official Account access_token management
 *
 * access_token is valid for 2 hours; requires caching and proactive refresh.
 * Uses in-memory cache + Promise deduplication to prevent concurrent duplicate requests.
 */

import { createLogger } from '@crewmeld/logger'
import { t } from '@/lib/core/server-i18n'

const logger = createLogger('WxoaToken')

interface TokenEntry {
  token: string
  expiresAt: number
}

/** In-memory cache: appId → token */
const tokenCache = new Map<string, TokenEntry>()

/** Concurrency control: appId → in-flight request Promise */
const pendingRequests = new Map<string, Promise<string>>()

/** Proactive refresh margin (5 minutes) */
const REFRESH_AHEAD_MS = 5 * 60 * 1000

interface WxoaTokenResponse {
  access_token?: string
  expires_in?: number
  errcode?: number
  errmsg?: string
}

/**
 * Get Official Account access_token (with caching)
 */
export async function getWxoaAccessToken(appId: string, appSecret: string): Promise<string> {
  const cached = tokenCache.get(appId)
  if (cached && cached.expiresAt > Date.now() + REFRESH_AHEAD_MS) {
    return cached.token
  }

  // Concurrency control: reuse in-flight request for the same appId
  const pending = pendingRequests.get(appId)
  if (pending) return pending

  const promise = fetchAccessToken(appId, appSecret)
  pendingRequests.set(appId, promise)

  try {
    return await promise
  } finally {
    pendingRequests.delete(appId)
  }
}

async function fetchAccessToken(appId: string, appSecret: string): Promise<string> {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`

  const res = await fetch(url)
  const data = (await res.json()) as WxoaTokenResponse

  if (data.errcode && data.errcode !== 0) {
    logger.error('Failed to get access_token', { errcode: data.errcode, errmsg: data.errmsg })
    throw new Error(`${t('channelWxoaTokenFailed')}: ${data.errcode} ${data.errmsg}`)
  }

  if (!data.access_token || !data.expires_in) {
    throw new Error(t('channelWxoaTokenBadResponse'))
  }

  const expiresAt = Date.now() + data.expires_in * 1000
  tokenCache.set(appId, { token: data.access_token, expiresAt })

  logger.info('access_token obtained successfully', { appId, expiresIn: data.expires_in })
  return data.access_token
}

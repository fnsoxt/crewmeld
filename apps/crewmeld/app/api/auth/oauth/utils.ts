import { db } from '@crewmeld/db'
import { account } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, desc, eq } from 'drizzle-orm'
import { refreshOAuthToken } from '@/lib/oauth'
import {
  getMicrosoftRefreshTokenExpiry,
  isMicrosoftProvider,
  PROACTIVE_REFRESH_THRESHOLD_DAYS,
} from '@/lib/oauth/microsoft'

const logger = createLogger('OAuthUtilsAPI')

/** Payload for inserting a new OAuth account record. */
interface AccountInsertData {
  id: string
  userId: string
  providerId: string
  accountId: string
  accessToken: string
  scope: string
  createdAt: Date
  updatedAt: Date
  refreshToken?: string
  idToken?: string
  accessTokenExpiresAt?: Date
}

/**
 * Safely inserts an account record, handling duplicate constraint violations gracefully.
 * On a duplicate key (code 23505), logs a warning and returns without throwing.
 */
export async function safeAccountInsert(
  data: AccountInsertData,
  context: { provider: string; identifier?: string }
): Promise<void> {
  try {
    await db.insert(account).values(data)
    logger.info(`Created new ${context.provider} account`, { userId: data.userId })
  } catch (err: unknown) {
    const code = (err as Record<string, unknown>)?.code
    if (code === '23505') {
      logger.error(`Duplicate ${context.provider} account — credential already exists`, {
        userId: data.userId,
        identifier: context.identifier,
      })
      return
    }
    throw err
  }
}

/**
 * Fetch a credential by ID, scoped to a specific owner.
 * Returns undefined when the record does not exist.
 */
export async function getCredential(requestId: string, credentialId: string, userId: string) {
  const rows = await db
    .select()
    .from(account)
    .where(and(eq(account.id, credentialId), eq(account.userId, userId)))
    .limit(1)

  if (rows.length === 0) {
    logger.warn(`[${requestId}] Credential not found`)
    return undefined
  }

  return rows[0]
}

/** Return a valid access token for the given user + provider, refreshing when necessary. */
export async function getOAuthToken(userId: string, providerId: string): Promise<string | null> {
  const rows = await db
    .select({
      id: account.id,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      accessTokenExpiresAt: account.accessTokenExpiresAt,
      idToken: account.idToken,
      scope: account.scope,
    })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, providerId)))
    .orderBy(desc(account.updatedAt))
    .limit(1)

  if (rows.length === 0) {
    logger.warn(`No OAuth token found for user ${userId}, provider ${providerId}`)
    return null
  }

  const credential = rows[0]
  const now = new Date()
  const isExpired = credential.accessTokenExpiresAt != null && credential.accessTokenExpiresAt < now
  const needsRefresh = !!credential.refreshToken && (!credential.accessToken || isExpired)

  if (!needsRefresh) {
    if (!credential.accessToken) {
      logger.warn(
        `No access token and no refresh possible for user ${userId}, provider ${providerId}`
      )
      return null
    }
    logger.info(`Found valid OAuth token for user ${userId}, provider ${providerId}`)
    return credential.accessToken
  }

  logger.info(`Access token expired for user ${userId}, provider ${providerId} — refreshing`)

  try {
    const refreshed = await refreshOAuthToken(providerId, credential.refreshToken!)

    if (!refreshed) {
      logger.error(`Token refresh failed for user ${userId}, provider ${providerId}`)
      return null
    }

    const patch: Record<string, unknown> = {
      accessToken: refreshed.accessToken,
      accessTokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
      updatedAt: new Date(),
    }

    if (refreshed.refreshToken && refreshed.refreshToken !== credential.refreshToken) {
      logger.info(`Rotating refresh token for user ${userId}, provider ${providerId}`)
      patch.refreshToken = refreshed.refreshToken
    }

    await db.update(account).set(patch).where(eq(account.id, credential.id))
    logger.info(`Token refreshed successfully for user ${userId}, provider ${providerId}`)
    return refreshed.accessToken
  } catch (err) {
    logger.error(`Error during token refresh for user ${userId}, provider ${providerId}`, {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
    return null
  }
}

/** Threshold helper: compute proactive-refresh boundary date. */
function proactiveRefreshBoundary(): Date {
  return new Date(Date.now() + PROACTIVE_REFRESH_THRESHOLD_DAYS * 24 * 60 * 60 * 1000)
}

/** Decide whether the credential needs a token refresh right now. */
function shouldRefreshCredential(
  credential: {
    refreshToken: string | null | undefined
    accessToken: string | null | undefined
    accessTokenExpiresAt: Date | null | undefined
    refreshTokenExpiresAt?: Date | null | undefined
    providerId: string
  },
  now: Date
): { doRefresh: boolean; accessExpired: boolean } {
  const accessExpired =
    !!credential.refreshToken &&
    (!credential.accessToken ||
      (credential.accessTokenExpiresAt != null && credential.accessTokenExpiresAt <= now))

  const proactiveExpiry =
    !!credential.refreshToken &&
    isMicrosoftProvider(credential.providerId) &&
    credential.refreshTokenExpiresAt != null &&
    credential.refreshTokenExpiresAt <= proactiveRefreshBoundary()

  return { doRefresh: accessExpired || proactiveExpiry, accessExpired }
}

/**
 * Return a valid access token for the credential identified by `credentialId`.
 * Refreshes the stored token when expired; updates the DB with the new token.
 */
export async function refreshAccessTokenIfNeeded(
  credentialId: string,
  userId: string,
  requestId: string
): Promise<string | null> {
  const credential = await getCredential(requestId, credentialId, userId)
  if (!credential) return null

  const now = new Date()
  const { doRefresh, accessExpired } = shouldRefreshCredential(credential, now)
  const currentToken = credential.accessToken

  if (!doRefresh) {
    if (!currentToken) {
      logger.error(`[${requestId}] No access token available for credential`)
      return null
    }
    logger.info(`[${requestId}] Access token is valid`)
    return currentToken
  }

  logger.info(`[${requestId}] Refreshing token for credential`)

  try {
    const refreshed = await refreshOAuthToken(credential.providerId, credential.refreshToken!)

    if (!refreshed) {
      logger.error(`[${requestId}] Token refresh returned null`, { credentialId })
      return !accessExpired && currentToken ? currentToken : null
    }

    const patch: Record<string, unknown> = {
      accessToken: refreshed.accessToken,
      accessTokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
      updatedAt: new Date(),
    }

    if (refreshed.refreshToken && refreshed.refreshToken !== credential.refreshToken) {
      logger.info(`[${requestId}] Rotating refresh token`)
      patch.refreshToken = refreshed.refreshToken
    }

    if (isMicrosoftProvider(credential.providerId)) {
      patch.refreshTokenExpiresAt = getMicrosoftRefreshTokenExpiry()
    }

    await db.update(account).set(patch).where(eq(account.id, credentialId))
    logger.info(`[${requestId}] Access token refreshed successfully`)
    return refreshed.accessToken
  } catch (err) {
    logger.error(`[${requestId}] Error refreshing token`, {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      credentialId,
    })
    return !accessExpired && currentToken ? currentToken : null
  }
}

/** Result type for {@link refreshTokenIfNeeded}. */
export interface RefreshResult {
  accessToken: string
  refreshed: boolean
}

/**
 * Enhanced refresh helper that also reports whether a refresh occurred.
 * Throws when the token cannot be obtained.
 */
export async function refreshTokenIfNeeded(
  requestId: string,
  credential: {
    id: string
    userId: string
    providerId: string
    accessToken: string | null | undefined
    refreshToken: string | null | undefined
    accessTokenExpiresAt: Date | null | undefined
    refreshTokenExpiresAt?: Date | null | undefined
  },
  credentialId: string
): Promise<RefreshResult> {
  const now = new Date()
  const { doRefresh, accessExpired } = shouldRefreshCredential(credential, now)

  if (!doRefresh) {
    logger.info(`[${requestId}] Access token is valid — no refresh needed`)
    return { accessToken: credential.accessToken!, refreshed: false }
  }

  try {
    const refreshed = await refreshOAuthToken(credential.providerId, credential.refreshToken!)

    if (!refreshed) {
      if (!accessExpired && credential.accessToken) {
        logger.info(`[${requestId}] Proactive refresh failed — existing token still valid`)
        return { accessToken: credential.accessToken, refreshed: false }
      }
      throw new Error('Token refresh returned null')
    }

    const patch: Record<string, unknown> = {
      accessToken: refreshed.accessToken,
      accessTokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
      updatedAt: new Date(),
    }

    if (refreshed.refreshToken && refreshed.refreshToken !== credential.refreshToken) {
      logger.info(`[${requestId}] Rotating refresh token`)
      patch.refreshToken = refreshed.refreshToken
    }

    if (isMicrosoftProvider(credential.providerId)) {
      patch.refreshTokenExpiresAt = getMicrosoftRefreshTokenExpiry()
    }

    await db.update(account).set(patch).where(eq(account.id, credentialId))
    logger.info(`[${requestId}] Access token refreshed`)
    return { accessToken: refreshed.accessToken, refreshed: true }
  } catch (err) {
    logger.warn(`[${requestId}] Refresh attempt failed — checking for concurrent success`)

    // Another concurrent request may have already refreshed; re-read the DB.
    const fresh = await getCredential(requestId, credentialId, credential.userId)
    if (fresh?.accessToken) {
      const notExpired = !fresh.accessTokenExpiresAt || fresh.accessTokenExpiresAt > new Date()
      if (notExpired) {
        logger.info(`[${requestId}] Found valid token from concurrent refresh`)
        return { accessToken: fresh.accessToken, refreshed: true }
      }
    }

    if (!accessExpired && credential.accessToken) {
      logger.info(`[${requestId}] Proactive refresh failed — existing token still valid`)
      return { accessToken: credential.accessToken, refreshed: false }
    }

    logger.error(`[${requestId}] No valid token obtainable after refresh failure`, err)
    throw err
  }
}

import { account, db, user } from '@crewmeld/db'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import { jwtDecode } from 'jwt-decode'
import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { generateRequestId } from '@/lib/core/utils/request'
import type { OAuthProvider } from '@/lib/oauth'
import { evaluateScopeCoverage, parseProvider } from '@/lib/oauth'
import type { OAuthProvider as OAuthProviderType } from '@/lib/oauth/types'

const logger = createLogger('OAuthConnectionsAPI')

/** Minimal fields decoded from an OIDC ID token. */
interface DecodedIdToken {
  email?: string
  sub?: string
  name?: string
}

/** Attempt to extract a display name from the account's ID token. */
function displayNameFromIdToken(
  idToken: string | null | undefined,
  requestId: string,
  accountId: string
): string {
  if (!idToken) return ''
  try {
    const decoded = jwtDecode<DecodedIdToken>(idToken)
    return decoded.email ?? decoded.name ?? ''
  } catch {
    logger.warn(`[${requestId}] Could not decode ID token`, { accountId })
    return ''
  }
}

/** Resolve a human-readable display name for an account row. */
function resolveDisplayName(
  acc: { id: string; idToken: string | null | undefined; accountId: string; providerId: string },
  baseProvider: string,
  fallbackEmail: string | null | undefined,
  requestId: string
): string {
  const fromToken = displayNameFromIdToken(acc.idToken, requestId, acc.id)
  if (fromToken) return fromToken

  if (baseProvider === 'github') return `${acc.accountId} (GitHub)`
  if (fallbackEmail) return fallbackEmail
  return `${acc.accountId} (${baseProvider})`
}

/** Return all OAuth connections for the authenticated user. */
export async function GET(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn(`[${requestId}] Unauthenticated request rejected`)
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
    }
    const userId = session.user.id

    const [accounts, userRows] = await Promise.all([
      db.select().from(account).where(eq(account.userId, userId)),
      db.select({ email: user.email }).from(user).where(eq(user.id, userId)).limit(1),
    ])

    const userEmail = userRows[0]?.email ?? null

    type ConnectionEntry = {
      provider: string
      baseProvider: string
      featureType: string | undefined
      isConnected: boolean
      scopes: string[]
      canonicalScopes: string[]
      missingScopes: string[]
      extraScopes: string[]
      requiresReauthorization: boolean
      lastConnected: string
      accounts: unknown[]
    }

    const connectionMap = new Map<string, ConnectionEntry>()

    for (const acc of accounts) {
      const { baseProvider, featureType } = parseProvider(acc.providerId as OAuthProvider)
      if (!baseProvider) continue

      const grantedScopes = acc.scope ? acc.scope.split(/\s+/).filter(Boolean) : []
      const scopeEval = evaluateScopeCoverage(acc.providerId as OAuthProviderType, grantedScopes)

      const displayName = resolveDisplayName(acc, baseProvider, userEmail, requestId)

      const accountSummary = {
        id: acc.id,
        name: displayName,
        scopes: scopeEval.grantedScopes,
        missingScopes: scopeEval.missingScopes,
        extraScopes: scopeEval.extraScopes,
        requiresReauthorization: scopeEval.requiresReauthorization,
      }

      const existing = connectionMap.get(acc.providerId)

      if (existing) {
        existing.accounts.push(accountSummary)
        existing.scopes = [...new Set([...existing.scopes, ...scopeEval.grantedScopes])]
        existing.missingScopes = [
          ...new Set([...existing.missingScopes, ...scopeEval.missingScopes]),
        ]
        existing.extraScopes = [...new Set([...existing.extraScopes, ...scopeEval.extraScopes])]
        if (!existing.canonicalScopes.length) {
          existing.canonicalScopes = scopeEval.canonicalScopes
        }
        existing.requiresReauthorization =
          existing.requiresReauthorization || scopeEval.requiresReauthorization

        const existingTs = existing.lastConnected ? new Date(existing.lastConnected).getTime() : 0
        if (acc.updatedAt.getTime() > existingTs) {
          existing.lastConnected = acc.updatedAt.toISOString()
        }
      } else {
        connectionMap.set(acc.providerId, {
          provider: acc.providerId,
          baseProvider,
          featureType,
          isConnected: true,
          scopes: scopeEval.grantedScopes,
          canonicalScopes: scopeEval.canonicalScopes,
          missingScopes: scopeEval.missingScopes,
          extraScopes: scopeEval.extraScopes,
          requiresReauthorization: scopeEval.requiresReauthorization,
          lastConnected: acc.updatedAt.toISOString(),
          accounts: [accountSummary],
        })
      }
    }

    return NextResponse.json({ connections: [...connectionMap.values()] })
  } catch (err) {
    logger.error(`[${requestId}] Error fetching OAuth connections`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

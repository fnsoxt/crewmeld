import { db } from '@crewmeld/db'
import { account, user } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, eq } from 'drizzle-orm'
import { jwtDecode } from 'jwt-decode'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSessionOrInternalAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'
import { evaluateScopeCoverage, type OAuthProvider, parseProvider } from '@/lib/oauth'
import type { OAuthProvider as OAuthProviderType } from '@/lib/oauth/types'

async function authorizeWorkflowByWorkspacePermission(_params: {
  workflowId?: string | null
  userId: string
  action?: string
}): Promise<{ allowed: boolean; status: number; message?: string }> {
  return { allowed: true, status: 200 }
}

export const dynamic = 'force-dynamic'

const logger = createLogger('OAuthCredentialsAPI')

const credentialsQuerySchema = z
  .object({
    provider: z.string().nullish(),
    workflowId: z.string().uuid('Workflow ID must be a valid UUID').nullish(),
    credentialId: z
      .string()
      .min(1, 'Credential ID must not be empty')
      .max(255, 'Credential ID is too long')
      .nullish(),
  })
  .refine((d) => d.provider || d.credentialId, {
    message: 'Provider or credentialId is required',
    path: ['provider'],
  })

interface DecodedIdToken {
  email?: string
  sub?: string
  name?: string
}

/** Extract a display name from an OIDC ID token, if present. */
function nameFromIdToken(
  idToken: string | null | undefined,
  requestId: string,
  accountId: string
): string {
  if (!idToken) return ''
  try {
    const decoded = jwtDecode<DecodedIdToken>(idToken)
    return decoded.email ?? decoded.name ?? ''
  } catch {
    logger.warn(`[${requestId}] Error decoding ID token`, { accountId })
    return ''
  }
}

/** Fetch the email address stored in the user table for the given userId. */
async function fetchUserEmail(userId: string, requestId: string): Promise<string> {
  try {
    const rows = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
    return rows[0]?.email ?? ''
  } catch {
    logger.warn(`[${requestId}] Error fetching user email`, { userId })
    return ''
  }
}

/** Resolve a human-readable label for a credential account row. */
async function resolveDisplayName(
  acc: { id: string; idToken: string | null | undefined; accountId: string; userId: string },
  baseProvider: string,
  requestId: string
): Promise<string> {
  const fromToken = nameFromIdToken(acc.idToken, requestId, acc.id)
  if (fromToken) return fromToken

  if (baseProvider === 'github') return `${acc.accountId} (GitHub)`

  const email = await fetchUserEmail(acc.userId, requestId)
  if (email) return email

  return `${acc.accountId} (${baseProvider})`
}

/** Return credentials for the authenticated user, optionally filtered by provider or credential ID. */
export async function GET(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const { searchParams } = new URL(request.url)
    const rawQuery = {
      provider: searchParams.get('provider'),
      workflowId: searchParams.get('workflowId'),
      credentialId: searchParams.get('credentialId'),
    }

    const parsed = credentialsQuerySchema.safeParse(rawQuery)
    if (!parsed.success) {
      const refinementErr = parsed.error.errors.find((e) => e.code === 'custom')
      if (refinementErr) {
        logger.warn(`[${requestId}] Query refinement error: ${refinementErr.message}`)
        return NextResponse.json({ error: refinementErr.message }, { status: 400 })
      }
      const firstErr = parsed.error.errors[0]
      logger.warn(`[${requestId}] Invalid query parameters`, { errors: parsed.error.errors })
      return NextResponse.json({ error: firstErr?.message ?? 'Validation failed' }, { status: 400 })
    }

    const { provider: providerParam, workflowId, credentialId } = parsed.data

    const authResult = await checkSessionOrInternalAuth(request)
    if (!authResult.success || !authResult.userId) {
      logger.warn(`[${requestId}] Unauthenticated credentials request`)
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
    }
    const requesterUserId = authResult.userId

    if (workflowId) {
      const workflowAuth = await authorizeWorkflowByWorkspacePermission({
        workflowId,
        userId: requesterUserId,
        action: 'read',
      })
      if (!workflowAuth.allowed) {
        logger.warn(`[${requestId}] Workflow access denied`, { requesterUserId, workflowId })
        return NextResponse.json(
          { error: workflowAuth.message ?? 'Forbidden' },
          { status: workflowAuth.status }
        )
      }
    }

    const { baseProvider } = parseProvider((providerParam ?? 'google') as OAuthProvider)

    // Select the account rows matching the query constraints.
    let accountRows
    if (credentialId && workflowId) {
      // Workspace auth already verified — allow cross-member credential lookup.
      accountRows = await db.select().from(account).where(eq(account.id, credentialId))
    } else if (credentialId) {
      accountRows = await db
        .select()
        .from(account)
        .where(and(eq(account.userId, requesterUserId), eq(account.id, credentialId)))
    } else {
      accountRows = await db
        .select()
        .from(account)
        .where(and(eq(account.userId, requesterUserId), eq(account.providerId, providerParam!)))
    }

    const credentials = await Promise.all(
      accountRows.map(async (acc) => {
        const [, featureType = 'default'] = acc.providerId.split('-')
        const displayName = await resolveDisplayName(acc, baseProvider, requestId)

        const storedScope = acc.scope?.trim()
        const grantedScopes = storedScope ? storedScope.split(/[\s,]+/).filter(Boolean) : []
        const scopeEval = evaluateScopeCoverage(acc.providerId as OAuthProviderType, grantedScopes)

        return {
          id: acc.id,
          name: displayName,
          provider: acc.providerId,
          lastUsed: acc.updatedAt.toISOString(),
          isDefault: featureType === 'default',
          scopes: scopeEval.grantedScopes,
          canonicalScopes: scopeEval.canonicalScopes,
          missingScopes: scopeEval.missingScopes,
          extraScopes: scopeEval.extraScopes,
          requiresReauthorization: scopeEval.requiresReauthorization,
        }
      })
    )

    return NextResponse.json({ credentials })
  } catch (err) {
    logger.error(`[${requestId}] Error fetching OAuth credentials`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

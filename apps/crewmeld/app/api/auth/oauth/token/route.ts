import { createLogger } from '@crewmeld/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authorizeCredentialUse } from '@/lib/auth/credential-access'
import { checkSessionOrInternalAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'
import { getCredential, getOAuthToken, refreshTokenIfNeeded } from '@/app/api/auth/oauth/utils'

export const dynamic = 'force-dynamic'

const logger = createLogger('OAuthTokenAPI')

/** Matches the Salesforce instance URL embedded in the credential scope field. */
const SALESFORCE_INSTANCE_URL_REGEX = /__sf_instance__:([^\s]+)/

const tokenRequestSchema = z
  .object({
    credentialId: z.string().min(1).optional(),
    credentialAccountUserId: z.string().min(1).optional(),
    providerId: z.string().min(1).optional(),
    workflowId: z.string().min(1).nullish(),
  })
  .refine(
    (d) => d.credentialId || (d.credentialAccountUserId && d.providerId),
    'Either credentialId or (credentialAccountUserId + providerId) is required'
  )

const tokenQuerySchema = z.object({
  credentialId: z
    .string({
      required_error: 'Credential ID is required',
      invalid_type_error: 'Credential ID is required',
    })
    .min(1, 'Credential ID is required'),
})

/** Extract the Salesforce instance URL from the credential's scope field, if present. */
function extractSalesforceInstanceUrl(
  providerId: string,
  scope: string | null | undefined
): string | undefined {
  if (providerId !== 'salesforce' || !scope) return undefined
  const match = scope.match(SALESFORCE_INSTANCE_URL_REGEX)
  return match?.[1]
}

/**
 * Return an access token for a credential.
 * Supports session-based auth (client side) and workflow-based auth (server side).
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  logger.info(`[${requestId}] OAuth token POST received`)

  try {
    const rawBody = await request.json()
    const parsed = tokenRequestSchema.safeParse(rawBody)

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]
      logger.warn(`[${requestId}] Invalid token request`, { errors: parsed.error.errors })
      return NextResponse.json(
        { error: firstError?.message ?? 'Validation failed' },
        { status: 400 }
      )
    }

    const { credentialId, credentialAccountUserId, providerId, workflowId } = parsed.data

    // Path A: look up by user ID + provider (legacy / internal usage)
    if (credentialAccountUserId && providerId) {
      logger.info(`[${requestId}] Fetching token by userId + providerId`, {
        credentialAccountUserId,
        providerId,
      })

      const sessionAuth = await checkSessionOrInternalAuth(request, { requireWorkflowId: false })
      if (!sessionAuth.success || sessionAuth.authType !== 'session' || !sessionAuth.userId) {
        logger.warn(`[${requestId}] Unauthenticated request on userId+providerId path`)
        return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
      }

      if (sessionAuth.userId !== credentialAccountUserId) {
        logger.warn(`[${requestId}] User mismatch on userId+providerId path`, {
          actual: sessionAuth.userId,
          requested: credentialAccountUserId,
        })
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      try {
        const accessToken = await getOAuthToken(credentialAccountUserId, providerId)
        if (!accessToken) {
          return NextResponse.json(
            {
              error: `No credential found for user ${credentialAccountUserId} and provider ${providerId}`,
            },
            { status: 404 }
          )
        }
        return NextResponse.json({ accessToken })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to get OAuth token'
        logger.warn(`[${requestId}] OAuth token error: ${msg}`)
        return NextResponse.json({ error: msg }, { status: 403 })
      }
    }

    // Path B: look up by credential ID
    if (!credentialId) {
      return NextResponse.json({ error: 'Credential ID is required' }, { status: 400 })
    }

    const authz = await authorizeCredentialUse(request, {
      credentialId,
      workflowId: workflowId ?? undefined,
      requireWorkflowIdForInternal: false,
    })

    if (!authz.ok || !authz.credentialOwnerUserId) {
      return NextResponse.json({ error: authz.error ?? 'Unauthorized' }, { status: 403 })
    }

    const credential = await getCredential(requestId, credentialId, authz.credentialOwnerUserId)
    if (!credential) {
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 })
    }

    try {
      const { accessToken } = await refreshTokenIfNeeded(requestId, credential, credentialId)
      const instanceUrl = extractSalesforceInstanceUrl(credential.providerId, credential.scope)

      return NextResponse.json({
        accessToken,
        idToken: credential.idToken ?? undefined,
        ...(instanceUrl && { instanceUrl }),
      })
    } catch (err) {
      logger.error(`[${requestId}] Failed to refresh access token`, err)
      return NextResponse.json({ error: 'Failed to refresh access token' }, { status: 401 })
    }
  } catch (err) {
    logger.error(`[${requestId}] Error in token POST`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Return the access token for a credential (session-only, no workflow auth). */
export async function GET(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const { searchParams } = new URL(request.url)
    const parsed = tokenQuerySchema.safeParse({ credentialId: searchParams.get('credentialId') })

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]
      logger.warn(`[${requestId}] Invalid query`, { errors: parsed.error.errors })
      return NextResponse.json(
        { error: firstError?.message ?? 'Validation failed' },
        { status: 400 }
      )
    }

    const { credentialId } = parsed.data

    const sessionAuth = await checkSessionOrInternalAuth(request, { requireWorkflowId: false })
    if (!sessionAuth.success || sessionAuth.authType !== 'session' || !sessionAuth.userId) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
    }

    const credential = await getCredential(requestId, credentialId, sessionAuth.userId)
    if (!credential) {
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 })
    }

    if (!credential.accessToken) {
      logger.warn(`[${requestId}] No access token stored for credential`)
      return NextResponse.json({ error: 'No access token available' }, { status: 400 })
    }

    try {
      const { accessToken } = await refreshTokenIfNeeded(requestId, credential, credentialId)
      const instanceUrl = extractSalesforceInstanceUrl(credential.providerId, credential.scope)

      return NextResponse.json({
        accessToken,
        idToken: credential.idToken ?? undefined,
        ...(instanceUrl && { instanceUrl }),
      })
    } catch {
      return NextResponse.json({ error: 'Failed to refresh access token' }, { status: 401 })
    }
  } catch (err) {
    logger.error(`[${requestId}] Error in token GET`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

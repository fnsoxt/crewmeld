import { db } from '@crewmeld/db'
import { account } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, eq, like, or } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { AuditAction, AuditResourceType, recordAudit } from '@/lib/audit/log'
import { getSession } from '@/lib/auth'
import { generateRequestId } from '@/lib/core/utils/request'

export const dynamic = 'force-dynamic'

const logger = createLogger('OAuthDisconnectAPI')

const disconnectSchema = z.object({
  provider: z.string({ required_error: 'Provider is required' }).min(1, 'Provider is required'),
  providerId: z.string().optional(),
})

/**
 * Disconnect an OAuth provider for the current user by deleting matching
 * account row(s). (Webhook / credential-set cleanup was removed along with
 * the upstream webhook subsystem.)
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId()

  const session = await getSession()
  if (!session?.user?.id) {
    logger.warn(`[${requestId}] Unauthenticated disconnect request rejected`)
    return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
  }
  const userId = session.user.id

  let provider: string
  let providerId: string | undefined

  try {
    const rawBody = await request.json()
    const parsed = disconnectSchema.safeParse(rawBody)

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]
      logger.warn(`[${requestId}] Invalid disconnect request`, { errors: parsed.error.errors })
      return NextResponse.json(
        { error: firstError?.message ?? 'Validation failed' },
        { status: 400 }
      )
    }

    ;({ provider, providerId } = parsed.data)
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  logger.info(`[${requestId}] Processing OAuth disconnect`, {
    provider,
    hasProviderId: !!providerId,
  })

  try {
    if (providerId) {
      await db
        .delete(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, providerId)))
    } else {
      await db
        .delete(account)
        .where(
          and(
            eq(account.userId, userId),
            or(eq(account.providerId, provider), like(account.providerId, `${provider}-%`))
          )
        )
    }

    recordAudit({
      workspaceId: null,
      actorId: userId,
      action: AuditAction.OAUTH_DISCONNECTED,
      resourceType: AuditResourceType.OAUTH,
      resourceId: providerId ?? provider,
      actorName: session.user.name ?? undefined,
      actorEmail: session.user.email ?? undefined,
      resourceName: provider,
      description: `Disconnected OAuth provider: ${provider}`,
      metadata: { provider, providerId },
      request,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error(`[${requestId}] Error disconnecting OAuth provider`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

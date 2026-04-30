import { db } from '@crewmeld/db'
import { account } from '@crewmeld/db/schema'
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { checkSessionOrInternalAuth } from '@/lib/auth/hybrid'

export interface CredentialAccessResult {
  ok: boolean
  error?: string
  authType?: 'session' | 'internal_jwt'
  requesterUserId?: string
  credentialOwnerUserId?: string
  workspaceId?: string
}

/**
 * Authorize credential use by verifying the authenticated caller owns the
 * credential. Cross-user collaboration paths that previously resolved
 * through a workflow's workspace are no longer supported (workflow canvas
 * has been removed); such requests are rejected.
 */
export async function authorizeCredentialUse(
  request: NextRequest,
  params: { credentialId: string; workflowId?: string; requireWorkflowIdForInternal?: boolean }
): Promise<CredentialAccessResult> {
  const { credentialId, requireWorkflowIdForInternal = true } = params

  const auth = await checkSessionOrInternalAuth(request, {
    requireWorkflowId: requireWorkflowIdForInternal,
  })
  if (!auth.success || !auth.userId) {
    return { ok: false, error: auth.error || 'Authentication required' }
  }

  const [credRow] = await db
    .select({ userId: account.userId })
    .from(account)
    .where(eq(account.id, credentialId))
    .limit(1)

  if (!credRow) {
    return { ok: false, error: 'Credential not found' }
  }

  const credentialOwnerUserId = credRow.userId

  if (auth.authType !== 'internal_jwt' && auth.userId === credentialOwnerUserId) {
    return {
      ok: true,
      authType: auth.authType as CredentialAccessResult['authType'],
      requesterUserId: auth.userId,
      credentialOwnerUserId,
    }
  }

  return { ok: false, error: 'Unauthorized' }
}

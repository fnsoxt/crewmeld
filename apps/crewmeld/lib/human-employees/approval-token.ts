import { randomUUID } from 'node:crypto'
import { db } from '@crewmeld/db'
import { sopPauseStates } from '@crewmeld/db/schema'
import { and, eq } from 'drizzle-orm'

interface GeneratedToken {
  token: string
  expiresAt: Date
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Generate an approval token for a pause record and persist it.
 *
 * Writes `approval_token` + `token_expires_at` onto the sopPauseStates row so
 * that later verification (email links, WeCom/Feishu approval cards) can match
 * the opaque token back to the pause.
 */
export async function generateApprovalToken(pauseId: string): Promise<GeneratedToken> {
  const token = randomUUID()
  const expiresAt = new Date(Date.now() + DEFAULT_TTL_MS)

  await db
    .update(sopPauseStates)
    .set({ approvalToken: token, tokenExpiresAt: expiresAt })
    .where(eq(sopPauseStates.id, pauseId))

  return { token, expiresAt }
}

/**
 * Verify an approval token by looking up the matching pause record.
 *
 * Returns `{ valid: true, pauseId }` only when the token exists on a
 * `waiting` pause and has not expired. Expired or already-decided pauses
 * fail verification so stale links cannot mutate state.
 */
export async function verifyApprovalToken(
  token: string
): Promise<{ valid: boolean; pauseId?: string }> {
  if (!token) return { valid: false }

  const rows = await db
    .select({
      id: sopPauseStates.id,
      status: sopPauseStates.status,
      tokenExpiresAt: sopPauseStates.tokenExpiresAt,
    })
    .from(sopPauseStates)
    .where(and(eq(sopPauseStates.approvalToken, token), eq(sopPauseStates.status, 'waiting')))
    .limit(1)

  if (rows.length === 0) return { valid: false }

  const row = rows[0]
  if (row.tokenExpiresAt && row.tokenExpiresAt < new Date()) {
    return { valid: false }
  }

  return { valid: true, pauseId: row.id }
}

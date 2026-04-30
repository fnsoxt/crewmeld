/**
 * GET /api/employee/sops/pause/[pauseId]/quick-decide/[token]/[decision]
 *
 * One-click approval — click a link to complete the approval, returns an HTML result page.
 * Suitable for URL-redirect scenarios like DingTalk.
 */

import { db } from '@crewmeld/db'
import { sopPauseStates } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { verifyApprovalToken } from '@/lib/human-employees/approval-token'
import { resumeSopFromPause } from '@/lib/sop/engine'
import { getSopTimeoutQueue } from '@/lib/sop/queue'

const logger = createLogger('API:Sops:QuickDecide')

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ pauseId: string; token: string; decision: string }> }
) {
  const { pauseId, token, decision } = await params

  if (!token || (decision !== 'approved' && decision !== 'rejected')) {
    return buildHtmlResponse('error', 'Invalid Parameters', 'Invalid approval link')
  }

  const verified = await verifyApprovalToken(token)
  if (!verified.valid) {
    return buildHtmlResponse(
      'error',
      'Link Expired',
      'This approval link is invalid or has expired. Please ask the sender to resend.'
    )
  }
  if (verified.pauseId !== pauseId) {
    return buildHtmlResponse(
      'error',
      'Invalid Parameters',
      'Approval link does not match the current approval'
    )
  }

  const decidedBy = 'quick-decide'

  const result = await db
    .update(sopPauseStates)
    .set({
      status: 'decided',
      decision: decision as 'approved' | 'rejected',
      decidedBy,
      decidedAt: new Date(),
    })
    .where(and(eq(sopPauseStates.id, pauseId), eq(sopPauseStates.status, 'waiting')))
    .returning()

  if (result.length === 0) {
    return buildHtmlResponse(
      'conflict',
      'Already Processed',
      'This approval has already been handled. No further action required.'
    )
  }

  const pauseState = result[0]

  if (pauseState.timeoutJobId) {
    const timeoutQueue = getSopTimeoutQueue()
    if (timeoutQueue) {
      try {
        const job = await timeoutQueue.getJob(pauseState.timeoutJobId)
        if (job) await job.remove()
      } catch {
        /* ignore */
      }
    }
  }

  void resumeSopFromPause({
    executionId: pauseState.executionId,
    nodeId: pauseState.nodeId,
    decision,
    decidedBy,
  })

  const decisionText = decision === 'approved' ? 'Approved' : 'Rejected'
  logger.info('One-click approval completed', { pauseId, decision, decidedBy })

  return buildHtmlResponse(
    'success',
    'Approval Completed',
    `You have chosen "${decisionText}". You can close this page.`
  )
}

function buildHtmlResponse(
  type: 'success' | 'error' | 'conflict',
  title: string,
  message: string
): Response {
  const colors = {
    success: { bg: '#f0fdf4', border: '#bbf7d0', icon: '#22c55e', iconBg: '#dcfce7' },
    error: { bg: '#fef2f2', border: '#fecaca', icon: '#ef4444', iconBg: '#fee2e2' },
    conflict: { bg: '#fffbeb', border: '#fde68a', icon: '#f59e0b', iconBg: '#fef3c7' },
  }
  const c = colors[type]
  const iconPath =
    type === 'success'
      ? 'M5 13l4 4L19 7'
      : type === 'conflict'
        ? 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z'
        : 'M6 18L18 6M6 6l12 12'

  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title></head>
<body style="margin:0;padding:40px 20px;background:${c.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;justify-content:center;align-items:flex-start;min-height:100vh;">
  <div style="max-width:360px;width:100%;background:#fff;border-radius:12px;border:1px solid ${c.border};padding:32px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="width:48px;height:48px;border-radius:50%;background:${c.iconBg};display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="${c.icon}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${iconPath}"/></svg>
    </div>
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">${title}</h2>
    <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.5;">${message}</p>
  </div>
</body>
</html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

/**
 * DingTalk message card builder - SOP approval cards
 *
 * Uses DingTalk sampleActionCard6 message type (two independent jump buttons)
 */

import { t } from './card-i18n'

/**
 * Build SOP approval card
 */
export function buildApprovalCard(params: {
  sopName: string
  nodeName: string
  previousResult?: string
  pauseId: string
  approvalToken: string
  senderName?: string
  approvalPageUrl?: string
  language?: string
}): Record<string, unknown> {
  const lang = params.language ?? 'zh'
  const lines: string[] = []

  if (params.senderName) {
    lines.push(`**${t('sender', lang)}**${t('channelCardColon')}${params.senderName}`)
  }
  lines.push(`**${t('sopProcess', lang)}**${t('channelCardColon')}${params.sopName}`)
  lines.push(`**${t('currentStep', lang)}**${t('channelCardColon')}${params.nodeName}`)

  if (params.previousResult) {
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push(`**${t('pendingContent', lang)}**${t('channelCardColon')}`)
    lines.push(formatPreviousResult(params.previousResult))
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:6100'
  const approveUrl = `${appUrl}/api/employee/sops/pause/${params.pauseId}/quick-decide/${encodeURIComponent(params.approvalToken)}/approved`
  const rejectUrl = `${appUrl}/api/employee/sops/pause/${params.pauseId}/quick-decide/${encodeURIComponent(params.approvalToken)}/rejected`

  return {
    title: t('approvalRequest', lang),
    text: lines.join('  \n'),
    buttonTitle1: t('approve', lang),
    buttonUrl1: approveUrl,
    buttonTitle2: t('reject', lang),
    buttonUrl2: rejectUrl,
  }
}

/**
 * Build approval-done card
 */
export function buildApprovalDoneCard(params: {
  sopName: string
  nodeName: string
  decision: 'approved' | 'rejected'
  decidedBy: string
  senderName?: string
  previousResult?: string
  decidedAt?: Date
  language?: string
}): Record<string, unknown> {
  const lang = params.language ?? 'zh'
  const decisionText = params.decision === 'approved' ? t('approved', lang) : t('rejected', lang)
  const timeStr = (params.decidedAt ?? new Date()).toLocaleString(
    lang === 'zh' ? 'zh-CN' : 'en-US',
    { timeZone: 'Asia/Shanghai' }
  )

  const lines: string[] = []

  if (params.senderName) {
    lines.push(`**${t('sender', lang)}**${t('channelCardColon')}${params.senderName}`)
  }
  lines.push(`**${t('sopProcess', lang)}**${t('channelCardColon')}${params.sopName}`)
  lines.push(`**${t('approvalNode', lang)}**${t('channelCardColon')}${params.nodeName}`)

  if (params.previousResult) {
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push(`**${t('approvalContent', lang)}**${t('channelCardColon')}`)
    lines.push(formatPreviousResult(params.previousResult))
  }

  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push(`**${t('result', lang)}**${t('channelCardColon')}${decisionText}`)
  lines.push(`**${t('handler', lang)}**${t('channelCardColon')}${params.decidedBy}`)
  lines.push(`**${t('handledAt', lang)}**${t('channelCardColon')}${timeStr}`)

  return {
    title: `${t('approvalDone', lang)} — ${decisionText}`,
    text: lines.join('  \n'),
    buttonTitle1: decisionText,
    buttonUrl1: 'dingtalk://dingtalkclient/action/openapp',
  }
}

function formatPreviousResult(raw: string): string {
  const MAX_LEN = 800
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) {
      for (const key of ['result', 'output', 'content', 'text', 'summary', 'response']) {
        if (parsed[key] && typeof parsed[key] === 'string') {
          return truncate(parsed[key], MAX_LEN)
        }
      }
      const lines: string[] = []
      for (const [k, v] of Object.entries(parsed)) {
        if (k.startsWith('_')) continue
        if (v === null || v === undefined) continue
        lines.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      }
      return truncate(lines.join('\n') || raw, MAX_LEN)
    }
  } catch {
    /* not JSON */
  }
  return truncate(raw, MAX_LEN)
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen - 3)}...`
}

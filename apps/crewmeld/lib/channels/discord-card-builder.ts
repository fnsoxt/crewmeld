/**
 * Discord message card builder - SOP approval cards
 *
 * Uses Discord Embed + Button Components for approval interactions
 */

import { t } from './card-i18n'

/**
 * Build SOP approval card (Embed + Buttons)
 */
export function buildApprovalCard(params: {
  sopName: string
  nodeName: string
  previousResult?: string
  pauseId: string
  approvalToken?: string
  senderName?: string
  approvalPageUrl?: string
  language?: string
}): Record<string, unknown> {
  const lang = params.language ?? 'zh'
  const fields: Array<{ name: string; value: string; inline?: boolean }> = []

  if (params.senderName) {
    fields.push({ name: t('sender', lang), value: params.senderName, inline: true })
  }
  fields.push({ name: t('sopProcess', lang), value: params.sopName, inline: true })
  fields.push({ name: t('currentStep', lang), value: params.nodeName, inline: true })

  if (params.previousResult) {
    const truncated = formatPreviousResult(params.previousResult, lang)
    fields.push({ name: t('pendingContent', lang), value: truncated })
  }

  const embed = {
    title: t('approvalRequest', lang),
    color: 0x3498db,
    fields,
    timestamp: new Date().toISOString(),
  }

  const tokenPart = params.approvalToken ?? ''
  const components = [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: `✅ ${t('approve', lang)}`,
          custom_id: `approval:${params.pauseId}:approved:${tokenPart}`,
        },
        {
          type: 2,
          style: 4,
          label: `❌ ${t('reject', lang)}`,
          custom_id: `approval:${params.pauseId}:rejected:${tokenPart}`,
        },
      ],
    },
  ]

  return { embeds: [embed], components }
}

/**
 * Build approval-done card (state after buttons are replaced)
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
  const isApproved = params.decision === 'approved'
  const decisionText = isApproved ? t('approved', lang) : t('rejected', lang)
  const timeStr = (params.decidedAt ?? new Date()).toLocaleString(
    lang === 'zh' ? 'zh-CN' : 'en-US',
    { timeZone: 'Asia/Shanghai' }
  )

  const fields: Array<{ name: string; value: string; inline?: boolean }> = []

  if (params.senderName) {
    fields.push({ name: t('sender', lang), value: params.senderName, inline: true })
  }
  fields.push({ name: t('sopProcess', lang), value: params.sopName, inline: true })
  fields.push({ name: t('step', lang), value: params.nodeName, inline: true })

  if (params.previousResult) {
    fields.push({
      name: t('approvalContent', lang),
      value: formatPreviousResult(params.previousResult, lang),
    })
  }

  fields.push({ name: t('result', lang), value: decisionText, inline: true })
  fields.push({ name: t('handler', lang), value: params.decidedBy, inline: true })
  fields.push({ name: t('handledAt', lang), value: timeStr, inline: true })

  const embed = {
    title: t('approvalDone', lang),
    color: isApproved ? 0x2ecc71 : 0xe74c3c,
    fields,
    timestamp: new Date().toISOString(),
  }

  return { embeds: [embed], components: [] }
}

function formatPreviousResult(raw: string, lang = 'zh'): string {
  const MAX_LEN = 800
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) {
      for (const key of ['result', 'output', 'content', 'text', 'summary', 'response']) {
        if (parsed[key] && typeof parsed[key] === 'string') {
          return truncate(parsed[key], MAX_LEN, lang)
        }
      }
      return truncate(JSON.stringify(parsed, null, 2), MAX_LEN, lang)
    }
  } catch {
    /* not JSON */
  }
  return truncate(raw, MAX_LEN, lang)
}

function truncate(text: string, maxLen: number, lang = 'zh'): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + t('truncated', lang)
}

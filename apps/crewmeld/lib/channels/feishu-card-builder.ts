/**
 * Feishu message card builder - SOP approval cards, progress cards
 *
 * Feishu card docs: https://open.feishu.cn/document/common-capabilities/message-card
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
  language?: string
}): Record<string, unknown> {
  const lang = params.language ?? 'zh'
  const senderLine = params.senderName
    ? `**${t('sender', lang)}**${t('channelCardColon')}${params.senderName}\n`
    : ''
  const elements: Record<string, unknown>[] = [
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `${senderLine}**${t('sopProcess', lang)}**${t('channelCardColon')}${params.sopName}\n**${t('currentStep', lang)}**${t('channelCardColon')}${params.nodeName}`,
      },
    },
  ]

  if (params.previousResult) {
    elements.push({ tag: 'hr' })
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**${t('pendingContent', lang)}**${t('channelCardColon')}\n${formatPreviousResult(params.previousResult, lang)}`,
      },
    })
  }

  elements.push({ tag: 'hr' })

  elements.push({
    tag: 'action',
    actions: [
      {
        tag: 'button',
        text: { tag: 'plain_text', content: t('approve', lang) },
        type: 'primary',
        value: { action: 'approved', pauseId: params.pauseId, token: params.approvalToken },
      },
      {
        tag: 'button',
        text: { tag: 'plain_text', content: t('reject', lang) },
        type: 'danger',
        value: { action: 'rejected', pauseId: params.pauseId, token: params.approvalToken },
      },
    ],
  })

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: t('approvalRequest', lang) },
      template: 'blue',
    },
    elements,
  }
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
  const decisionText = params.decision === 'approved' ? t('approved', lang) : t('rejected', lang)
  const timeStr = (params.decidedAt ?? new Date()).toLocaleString(
    lang === 'zh' ? 'zh-CN' : 'en-US',
    { timeZone: 'Asia/Shanghai' }
  )

  const senderLine = params.senderName
    ? `**${t('sender', lang)}**${t('channelCardColon')}${params.senderName}\n`
    : ''

  const elements: Record<string, unknown>[] = [
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `${senderLine}**${t('sopProcess', lang)}**${t('channelCardColon')}${params.sopName}\n**${t('step', lang)}**${t('channelCardColon')}${params.nodeName}`,
      },
    },
  ]

  if (params.previousResult) {
    elements.push({ tag: 'hr' })
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**${t('approvalContent', lang)}**${t('channelCardColon')}\n${formatPreviousResult(params.previousResult, lang)}`,
      },
    })
  }

  elements.push({ tag: 'hr' })
  elements.push({
    tag: 'div',
    text: {
      tag: 'lark_md',
      content: `**${t('result', lang)}**${t('channelCardColon')}${decisionText}\n**${t('handler', lang)}**${t('channelCardColon')}${params.decidedBy}\n**${t('handledAt', lang)}**${t('channelCardColon')}${timeStr}`,
    },
  })

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: t('approvalDone', lang) },
      template: params.decision === 'approved' ? 'green' : 'red',
    },
    elements,
  }
}

/**
 * Build SOP progress card
 */
export function buildProgressCard(params: {
  sopName: string
  status: string
  completedSteps: number
  totalSteps: number
  currentStep?: string
  language?: string
}): Record<string, unknown> {
  const lang = params.language ?? 'zh'
  const progressBar =
    '█'.repeat(params.completedSteps) + '░'.repeat(params.totalSteps - params.completedSteps)

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: `📊 ${params.sopName}` },
      template: params.status === 'completed' ? 'green' : 'blue',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${t('status', lang)}**${t('channelCardColon')}${params.status}\n**${t('progress', lang)}**${t('channelCardColon')}${progressBar} ${params.completedSteps}/${params.totalSteps}${params.currentStep ? `\n**${t('currentStep', lang)}**${t('channelCardColon')}${params.currentStep}` : ''}`,
        },
      },
    ],
  }
}

/**
 * Format previous step result into card-readable text
 */
function formatPreviousResult(raw: string, lang = 'zh'): string {
  const MAX_LEN = 800

  let text = raw
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) {
      for (const key of ['result', 'output', 'content', 'text', 'summary', 'response']) {
        if (parsed[key] && typeof parsed[key] === 'string') {
          text = parsed[key]
          break
        }
      }
      if (text === raw) {
        text = JSON.stringify(parsed, null, 2)
      }
    }
  } catch {
    // Not JSON, treat as plain text
  }

  return truncate(sanitizeForLarkMd(text), MAX_LEN, lang)
}

/**
 * Sanitize Markdown syntax not supported by Feishu lark_md
 */
function sanitizeForLarkMd(text: string): string {
  return text
    .replace(/^#{1,6}\s+(.+)$/gm, '**$1**')
    .replace(/```[\s\S]*?```/g, (match) => {
      return match.replace(/```\w*\n?/g, '').trim()
    })
    .replace(/`(.+?)`/g, '$1')
    .replace(/!\[(.+?)\]\(.+?\)/g, '[$1]')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function truncate(text: string, maxLen: number, lang = 'zh'): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + t('truncated', lang)
}

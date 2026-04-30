/**
 * Telegram Inline Keyboard approval card builder
 */

import { t } from './card-i18n'
import type { ApprovalCardParams, ApprovalDoneCardParams } from './plugin-types'

/**
 * Extract human-readable text from previousResult
 */
function extractReadableResult(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) {
      const summary = parsed.summary ?? parsed.result ?? parsed.content ?? parsed.text
      if (typeof summary === 'string') {
        return cleanMarkdownForTelegram(summary)
      }
      return cleanMarkdownForTelegram(JSON.stringify(parsed, null, 2))
    }
  } catch {
    // Not JSON
  }
  return cleanMarkdownForTelegram(raw)
}

/**
 * Clean Markdown to Telegram-friendly plain text / simple formatting
 */
function cleanMarkdownForTelegram(text: string): string {
  return text
    .replace(/\|[-:|\s]+\|/g, '')
    .replace(/\|(.+?)\|/g, (_match, content: string) => {
      const cells = content
        .split('|')
        .map((c: string) => c.trim())
        .filter(Boolean)
      return cells.join(' — ')
    })
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Build approval card (Inline Keyboard format)
 */
export function buildApprovalCard(params: ApprovalCardParams): Record<string, unknown> {
  const lang = params.language ?? 'zh'
  const lines: string[] = []

  lines.push(`${t('approvalRequest', lang).replace('📋 ', '📋 *')}*`)
  lines.push('')
  if (params.sopName) lines.push(`*${t('sopProcess', lang)}:* ${params.sopName}`)
  if (params.nodeName) lines.push(`*${t('step', lang)}:* ${params.nodeName}`)
  if (params.senderName) lines.push(`*${t('sender', lang)}:* ${params.senderName}`)
  if (params.deadline) lines.push(`*${t('deadline', lang)}:* ${params.deadline}`)

  if (params.aiSummary) {
    lines.push('')
    lines.push(`*${t('summary', lang)}:*`)
    lines.push(params.aiSummary)
  }

  if (params.previousResult) {
    lines.push('')
    lines.push(`*${t('previousResult', lang)}:*`)
    const readable = extractReadableResult(params.previousResult)
    const truncated = readable.length > 800 ? `${readable.slice(0, 800)}…` : readable
    lines.push(truncated)
  }

  return {
    text: lines.join('\n'),
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: `✅ ${t('approve', lang)}`,
            callback_data: `approval_${params.pauseId}_approved`,
          },
          {
            text: `❌ ${t('reject', lang)}`,
            callback_data: `approval_${params.pauseId}_rejected`,
          },
        ],
      ],
    },
  }
}

/**
 * Build approval done card (processed state text)
 */
export function buildApprovalDoneCard(params: ApprovalDoneCardParams): Record<string, unknown> {
  const lang = params.language ?? 'zh'
  const emoji = params.decision === 'approved' ? '✅' : '❌'
  const decisionText =
    params.decision === 'approved' ? t('approvedShort', lang) : t('rejectedShort', lang)
  const decidedAt = params.decidedAt
    ? params.decidedAt.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
        timeZone: 'Asia/Shanghai',
      })
    : new Date().toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { timeZone: 'Asia/Shanghai' })

  const approvalLabel = t('approvalLabel', lang)

  const lines: string[] = []

  lines.push(`${emoji} *${approvalLabel} ${decisionText}*`)
  lines.push('')
  if (params.sopName) lines.push(`*${t('sopProcess', lang)}:* ${params.sopName}`)
  if (params.nodeName) lines.push(`*${t('step', lang)}:* ${params.nodeName}`)
  lines.push(`*${t('approver', lang)}:* ${params.decidedBy}`)
  lines.push(`*${t('handledAt', lang)}:* ${decidedAt}`)

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard: [] },
  }
}

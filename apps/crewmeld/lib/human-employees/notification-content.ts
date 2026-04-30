import { t } from '@/lib/core/server-i18n'

interface NotificationPayload {
  sopName: string
  nodeName: string
  executionId: string
  aiSummary?: string
  deadline?: string
  previousNodeResult?: string
  previousNodeName?: string
}

interface NotificationContent {
  approvalUrl: string
  approveUrl: string
  rejectUrl: string
  subject: string
  body: string
}

export function buildNotificationContent(
  payload: NotificationPayload,
  baseUrl: string,
  pauseId: string,
  token: string,
  language = 'zh'
): NotificationContent {
  const approvalUrl = `${baseUrl}/approval/${pauseId}?token=${token}`
  const approveUrl = `${approvalUrl}&decision=approved`
  const rejectUrl = `${approvalUrl}&decision=rejected`

  const subject =
    language === 'zh'
      ? `[${t('approvalNode', language)}] ${payload.sopName} — ${payload.nodeName}`
      : `[Approval] ${payload.sopName} — ${payload.nodeName}`

  const lines =
    language === 'zh'
      ? [
          `${t('sopProcess', language)}${payload.sopName}${t('needsApproval', language)}`,
          ``,
          `${t('step', language)}: ${payload.nodeName}`,
          `ID: ${payload.executionId}`,
        ]
      : [
          `${t('sopProcess', language)} "${payload.sopName}" ${t('needsApproval', language).toLowerCase()}.`,
          ``,
          `${t('step', language)}: ${payload.nodeName}`,
          `ID: ${payload.executionId}`,
        ]

  if (payload.aiSummary) {
    lines.push(`${t('aiSummary', language)}: ${payload.aiSummary}`)
  }

  if (payload.deadline) {
    lines.push(`${t('deadline', language)}: ${payload.deadline}`)
  }

  if (payload.previousNodeResult) {
    const prevLabel = payload.previousNodeName
      ? `${t('emailPrevResult', language)} (${payload.previousNodeName})`
      : t('emailPrevResult', language)
    lines.push(``, `--- ${prevLabel} ---`)
    lines.push(formatResultText(payload.previousNodeResult, language))
  }

  lines.push(
    ``,
    `${t('approve', language)}: ${approveUrl}`,
    `${t('reject', language)}: ${rejectUrl}`
  )

  return {
    approvalUrl,
    approveUrl,
    rejectUrl,
    subject,
    body: lines.join('\n'),
  }
}

function formatResultText(raw: string, language = 'zh'): string {
  const MAX_LEN = 1500

  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'string') return truncate(parsed, MAX_LEN, language)
    if (typeof parsed !== 'object' || parsed === null) return truncate(raw, MAX_LEN, language)

    for (const key of ['result', 'output', 'content', 'text', 'summary', 'response', 'message']) {
      const val = (parsed as Record<string, unknown>)[key]
      if (typeof val === 'string' && val.trim()) return truncate(val, MAX_LEN, language)
    }

    const lines: string[] = []
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (key.startsWith('_')) continue
      if (val === null || val === undefined) continue
      const valStr = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val)
      lines.push(`${key}: ${valStr}`)
    }
    return truncate(lines.join('\n') || raw, MAX_LEN, language)
  } catch {
    return truncate(raw, MAX_LEN, language)
  }
}

function truncate(text: string, maxLen: number, language = 'zh'): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + t('truncated', language)
}

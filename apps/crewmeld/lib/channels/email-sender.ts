import { createLogger } from '@crewmeld/logger'
import nodemailer from 'nodemailer'
import { t } from './card-i18n'

const logger = createLogger('EmailSender')

interface SmtpConfig {
  smtpHost: unknown
  smtpPort: number
  smtpSecure?: unknown
  username: unknown
  password: unknown
  fromName?: unknown
  fromAddress?: unknown
}

interface SendApprovalEmailOptions {
  toAddress: string
  sopName: string
  nodeName: string
  approvalPageUrl: string
  approveUrl?: string
  rejectUrl?: string
  aiSummary?: string
  deadline?: string
  previousNodeResult?: string
  previousNodeName?: string
  /** Requester email, set as Reply-To and displayed in sender name */
  replyTo?: string
  /** User language code */
  language?: string
  smtpConfig: SmtpConfig
}

/**
 * Send approval confirmation email via SMTP
 */
export async function sendApprovalEmail(options: SendApprovalEmailOptions): Promise<void> {
  const {
    toAddress,
    sopName,
    nodeName,
    approvalPageUrl,
    approveUrl,
    rejectUrl,
    aiSummary,
    deadline,
    previousNodeResult,
    previousNodeName,
    replyTo,
    language,
    smtpConfig,
  } = options
  const lang = language ?? 'zh'

  const transporter = nodemailer.createTransport({
    host: String(smtpConfig.smtpHost),
    port: smtpConfig.smtpPort,
    // `Boolean(x) ?? y` never falls through — Boolean() is never nullish.
    // Fall back to port-based default only when smtpSecure is actually absent.
    secure:
      smtpConfig.smtpSecure !== undefined
        ? Boolean(smtpConfig.smtpSecure)
        : smtpConfig.smtpPort === 465,
    auth: {
      user: String(smtpConfig.username),
      pass: String(smtpConfig.password),
    },
  })

  const fromAddress = smtpConfig.fromAddress
    ? String(smtpConfig.fromAddress)
    : String(smtpConfig.username)
  const fromName = replyTo
    ? replyTo
    : smtpConfig.fromName
      ? String(smtpConfig.fromName)
      : t('emailSender', lang)
  const subject = `${t('emailSubject', lang)} ${sopName} — ${nodeName}`

  const htmlBody = buildApprovalEmailHtml({
    sopName,
    nodeName,
    approvalPageUrl,
    approveUrl: approveUrl ?? approvalPageUrl,
    rejectUrl: rejectUrl ?? approvalPageUrl,
    aiSummary,
    deadline,
    previousNodeResult,
    previousNodeName,
    language: lang,
  })

  await transporter.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to: toAddress,
    ...(replyTo ? { replyTo } : {}),
    subject,
    html: htmlBody,
  })

  logger.info('Approval confirmation email sent', { toAddress, sopName, nodeName })
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Lightweight Markdown to email-safe HTML
 */
function markdownToHtml(md: string): string {
  let html = escapeHtml(md)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
  html = html.replace(
    /`(.+?)`/g,
    '<code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;font-size:13px;">$1</code>'
  )
  html = html.replace(/^[-*]\s+(.+)/gm, '&nbsp;&nbsp;• $1')
  html = html.replace(/\n/g, '<br>')
  return html
}

/**
 * Convert JSON-formatted node output to readable text
 */
function formatNodeResult(raw: string): string {
  const MAX_LEN = 1500

  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'string') return truncateText(parsed, MAX_LEN)
    if (typeof parsed !== 'object' || parsed === null) return truncateText(raw, MAX_LEN)

    for (const key of ['result', 'output', 'content', 'text', 'summary', 'response', 'message']) {
      const val = (parsed as Record<string, unknown>)[key]
      if (typeof val === 'string' && val.trim()) return truncateText(val, MAX_LEN)
    }

    const lines: string[] = []
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (key.startsWith('_')) continue
      if (val === null || val === undefined) continue
      const valStr = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val)
      lines.push(`${key}: ${valStr}`)
    }
    return truncateText(lines.join('\n') || raw, MAX_LEN)
  } catch {
    return truncateText(raw, MAX_LEN)
  }
}

function truncateText(text: string, maxLen: number, lang = 'zh'): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + t('truncated', lang)
}

function buildApprovalEmailHtml(opts: {
  sopName: string
  nodeName: string
  approvalPageUrl: string
  approveUrl: string
  rejectUrl: string
  aiSummary?: string
  deadline?: string
  previousNodeResult?: string
  previousNodeName?: string
  language?: string
}): string {
  const {
    sopName,
    nodeName,
    approvalPageUrl,
    approveUrl,
    rejectUrl,
    aiSummary,
    deadline,
    previousNodeResult,
    previousNodeName,
  } = opts
  const lang = opts.language ?? 'zh'

  const summarySection = aiSummary
    ? `<tr><td style="padding:0 0 12px 0;color:#374151;font-size:14px;"><strong>${t('aiSummary', lang)}${t('channelCardColon', lang)}</strong>${markdownToHtml(aiSummary)}</td></tr>`
    : ''

  const deadlineSection = deadline
    ? `<tr><td style="padding:0 0 12px 0;color:#374151;font-size:14px;"><strong>${t('deadline', lang)}${t('channelCardColon', lang)}</strong>${escapeHtml(deadline)}</td></tr>`
    : ''

  const prevResultLabel = previousNodeName
    ? `${t('emailPrevResult', lang)}${lang === 'zh' ? '（' : ' ('}${escapeHtml(previousNodeName)}${lang === 'zh' ? '）' : ')'}`
    : t('emailPrevResult', lang)

  const previousResultSection = previousNodeResult
    ? `<tr>
         <td style="padding:16px 0 12px 0;color:#111827;font-size:14px;font-weight:600;border-top:1px solid #e5e7eb;">
           ${prevResultLabel}
         </td>
       </tr>
       <tr>
         <td style="padding:0 0 12px 0;">
           <div style="margin:0;padding:12px;background-color:#f3f4f6;border-radius:6px;color:#374151;font-size:14px;line-height:1.6;word-break:break-all;">${markdownToHtml(formatNodeResult(previousNodeResult))}</div>
         </td>
       </tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${sopName} — ${t('emailPendingConfirm', lang)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color:#111827;padding:24px 32px;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">${t('emailHeader', lang)}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:0 0 20px 0;color:#111827;font-size:16px;font-weight:600;">
                    ${t('emailGreeting', lang)}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 12px 0;color:#374151;font-size:14px;">
                    <strong>${t('emailTaskLabel', lang)}${t('channelCardColon', lang)}</strong>${sopName}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 12px 0;color:#374151;font-size:14px;">
                    <strong>${t('emailNodeLabel', lang)}${t('channelCardColon', lang)}</strong>${nodeName}
                  </td>
                </tr>
                ${summarySection}
                ${deadlineSection}
                ${previousResultSection}
                <tr>
                  <td style="padding:24px 0 0 0;">
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="48%" align="center" style="border-radius:6px;background-color:#dc2626;">
                          <a href="${rejectUrl}"
                             style="display:inline-block;width:100%;padding:12px 0;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;text-align:center;">
                            ${t('reject', lang)}
                          </a>
                        </td>
                        <td width="4%"></td>
                        <td width="48%" align="center" style="border-radius:6px;background-color:#16a34a;">
                          <a href="${approveUrl}"
                             style="display:inline-block;width:100%;padding:12px 0;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;text-align:center;">
                            ${t('approve', lang)}
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 0 0 0;color:#9ca3af;font-size:12px;">
                    ${t('emailInstruction', lang)}<br>
                    <a href="${approvalPageUrl}" style="color:#6b7280;word-break:break-all;">${approvalPageUrl}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                ${t('emailFooter', lang)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

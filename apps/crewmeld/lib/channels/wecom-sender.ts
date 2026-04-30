/**
 * WeCom (Enterprise WeChat) message sending service
 *
 * Reuses callWeComApiWithRetry() from tools/wecom/auth.ts
 */

import { createLogger } from '@crewmeld/logger'
import { callWeComApiWithRetry } from '@/lib/channels/wecom/auth'
import { getWeComErrorMessage } from '@/lib/channels/wecom/errors'
import { t } from '@/lib/core/server-i18n'
import { chunkForChannel } from './chunk'

const logger = createLogger('WecomSender')

interface WeComSendResult {
  errcode: number
  errmsg: string
  msgid?: string
}

/**
 * Send a WeCom text message (plain text, no markdown rendering)
 */
export async function sendWeComReply(
  corpId: string,
  corpSecret: string,
  agentId: string,
  toUser: string,
  content: string
): Promise<void> {
  const result = await callWeComApiWithRetry<WeComSendResult>(
    corpId,
    corpSecret,
    async (accessToken) => {
      const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          touser: toUser,
          msgtype: 'text',
          agentid: Number(agentId),
          text: { content },
        }),
      })
      return res.json() as Promise<WeComSendResult>
    }
  )

  if (result.errcode !== 0) {
    const msg = getWeComErrorMessage(result.errcode, result.errmsg)
    logger.error('WeCom message send failed', { toUser, error: msg })
    throw new Error(`WeCom message send failed: ${msg}`)
  }

  logger.info('WeCom message send succeeded', { toUser, msgid: result.msgid })
}

/**
 * Send a WeCom Markdown message (natively rendered by WeCom)
 *
 * @see https://developer.work.weixin.qq.com/document/path/90236#markdown%E6%B6%88%E6%81%AF
 */
export async function sendWeComMarkdown(
  corpId: string,
  corpSecret: string,
  agentId: string,
  toUser: string,
  content: string
): Promise<void> {
  const result = await callWeComApiWithRetry<WeComSendResult>(
    corpId,
    corpSecret,
    async (accessToken) => {
      const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          touser: toUser,
          msgtype: 'markdown',
          agentid: Number(agentId),
          markdown: { content },
        }),
      })
      return res.json() as Promise<WeComSendResult>
    }
  )

  if (result.errcode !== 0) {
    const msg = getWeComErrorMessage(result.errcode, result.errmsg)
    logger.error('WeCom markdown message send failed', { toUser, error: msg })
    throw new Error(`WeCom Markdown message send failed: ${msg}`)
  }

  logger.info('WeCom markdown message send succeeded', { toUser, msgid: result.msgid })
}

/**
 * Convert standard Markdown to WeCom-supported Markdown subset
 *
 * WeCom supports: **bold**, [link](url), > blockquote, \n newline, `code` (some clients)
 * Not supported: # headings, *italic*, - unordered lists, | tables |, ``` code blocks, ~~strikethrough~~, --- horizontal rules
 */
function sanitizeForWeCom(md: string): string {
  const lines = md.split('\n')
  const result: string[] = []
  let inCodeBlock = false
  let inTable = false
  let tableHeaders: string[] = []

  for (const line of lines) {
    // Code blocks → convert to plain text (strip ``` markers)
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      if (inTable) {
        inTable = false
        tableHeaders = []
      }
      continue
    }
    if (inCodeBlock) {
      result.push(line)
      continue
    }

    const trimmed = line.trim()

    // Headings → bold
    const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/)
    if (headingMatch) {
      if (inTable) {
        inTable = false
        tableHeaders = []
      }
      result.push(`**${headingMatch[1]}**`)
      continue
    }

    // Table separator row → skip
    if (/^\|[\s:?-]+\|/.test(trimmed) && !trimmed.replace(/[\s|:-]/g, '')) {
      continue
    }

    // Table row → convert to "column: value" format
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim())
      if (!inTable) {
        inTable = true
        tableHeaders = cells
        continue
      }
      const parts = cells.map((cell, i) => {
        const header = tableHeaders[i]
        return header ? `${header}${t('channelCardColon')}${cell}` : cell
      })
      result.push(parts.join('  '))
      continue
    }

    if (inTable) {
      inTable = false
      tableHeaders = []
    }

    // Horizontal rule → blank line
    if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
      result.push('')
      continue
    }

    // Unordered list → convert to "· " prefix
    const listMatch = trimmed.match(/^[-*+]\s+(.+)$/)
    if (listMatch) {
      result.push(`· ${listMatch[1]}`)
      continue
    }

    // Ordered lists kept as-is
    // Italic *text* → strip * keep text (avoid conflict with bold, only handle single *)
    let processed = line
    processed = processed.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    // Strikethrough ~~text~~ → strip ~~
    processed = processed.replace(/~~(.+?)~~/g, '$1')

    result.push(processed)
  }

  return result.join('\n')
}

/**
 * Send long messages in chunks (Markdown format, auto-sanitize unsupported syntax)
 */
export async function sendWeComChunked(
  corpId: string,
  corpSecret: string,
  agentId: string,
  toUser: string,
  content: string
): Promise<void> {
  const sanitized = sanitizeForWeCom(content)
  const chunks = chunkForChannel(sanitized, 'wecom')

  for (const chunk of chunks) {
    await sendWeComMarkdown(corpId, corpSecret, agentId, toUser, chunk)
  }
}

/**
 * Send an approval card (template_card, button_interaction type)
 */
export async function sendApprovalCard(
  corpId: string,
  corpSecret: string,
  agentId: string,
  toUser: string,
  card: Record<string, unknown>
): Promise<string | undefined> {
  const result = await callWeComApiWithRetry<WeComSendResult & { response_code?: string }>(
    corpId,
    corpSecret,
    async (accessToken) => {
      const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          touser: toUser,
          msgtype: 'template_card',
          agentid: Number(agentId),
          template_card: card,
        }),
      })
      return res.json() as Promise<WeComSendResult & { response_code?: string }>
    }
  )

  if (result.errcode !== 0) {
    const msg = getWeComErrorMessage(result.errcode, result.errmsg)
    logger.error('WeCom approval card send failed', { toUser, error: msg })
    throw new Error(`WeCom approval card send failed: ${msg}`)
  }

  logger.info('WeCom approval card send succeeded', { toUser, msgid: result.msgid })
  return result.response_code
}

/**
 * Update approval card status (grey out buttons after click)
 */
export async function updateApprovalCardStatus(
  corpId: string,
  corpSecret: string,
  agentId: string,
  responseCode: string,
  card: Record<string, unknown>,
  toUser?: string
): Promise<void> {
  const result = await callWeComApiWithRetry<{ errcode: number; errmsg: string }>(
    corpId,
    corpSecret,
    async (accessToken) => {
      const url = `https://qyapi.weixin.qq.com/cgi-bin/message/update_template_card?access_token=${accessToken}`
      const reqBody: Record<string, unknown> = {
        userids: toUser ? [toUser] : [],
        agentid: Number(agentId.trim()),
        response_code: responseCode,
        template_card: card,
      }
      logger.info('WeCom card update API request', {
        agentId,
        toUser,
        responseCode: responseCode?.slice(0, 20),
        responseCodeLen: responseCode?.length,
        hasCard: !!card,
        cardType: card?.card_type,
      })
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      })
      return res.json() as Promise<{ errcode: number; errmsg: string }>
    }
  )

  if (result.errcode !== 0) {
    const msg = getWeComErrorMessage(result.errcode, result.errmsg)
    logger.warn('WeCom approval card update failed', { error: msg })
  }
}

/**
 * Upload temporary media to WeCom, returns media_id
 *
 * @see https://developer.work.weixin.qq.com/document/path/90253
 */
async function uploadTempMedia(
  corpId: string,
  corpSecret: string,
  file: { name: string; mimeType: string; base64: string }
): Promise<string> {
  const result = await callWeComApiWithRetry<{
    errcode: number
    errmsg: string
    media_id?: string
  }>(corpId, corpSecret, async (accessToken) => {
    const url = `https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=${accessToken}&type=file`
    const buf = Buffer.from(file.base64, 'base64')
    const boundary = `----WebKitFormBoundary${Date.now().toString(36)}`
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="${file.name}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`
    )
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`)
    const body = Buffer.concat([header, buf, footer])
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    })
    return res.json() as Promise<{ errcode: number; errmsg: string; media_id?: string }>
  })

  if (result.errcode !== 0 || !result.media_id) {
    const msg = getWeComErrorMessage(result.errcode, result.errmsg)
    throw new Error(`WeCom media upload failed: ${msg}`)
  }

  logger.info('WeCom temporary media upload succeeded', {
    fileName: file.name,
    mediaId: result.media_id,
  })
  return result.media_id
}

/**
 * Send a file message (upload temporary media first, then send as file message type)
 */
export async function sendWeComFile(
  corpId: string,
  corpSecret: string,
  agentId: string,
  toUser: string,
  file: { name: string; mimeType: string; base64: string }
): Promise<void> {
  const mediaId = await uploadTempMedia(corpId, corpSecret, file)

  const result = await callWeComApiWithRetry<WeComSendResult>(
    corpId,
    corpSecret,
    async (accessToken) => {
      const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          touser: toUser,
          msgtype: 'file',
          agentid: Number(agentId),
          file: { media_id: mediaId },
        }),
      })
      return res.json() as Promise<WeComSendResult>
    }
  )

  if (result.errcode !== 0) {
    const msg = getWeComErrorMessage(result.errcode, result.errmsg)
    logger.error('WeCom file message send failed', { toUser, error: msg })
    throw new Error(`WeCom file message send failed: ${msg}`)
  }

  logger.info('WeCom file message send succeeded', { toUser, fileName: file.name })
}

/** Alias for sendWeComFile — sends file as a temp-media message with a textcard link */
export async function sendWeComFileAsLink(
  corpId: string,
  corpSecret: string,
  agentId: string,
  toUser: string,
  file: { name: string; mimeType: string; base64: string }
): Promise<void> {
  return sendWeComFile(corpId, corpSecret, agentId, toUser, file)
}

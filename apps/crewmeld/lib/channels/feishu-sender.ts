/**
 * Feishu message sending service - counterpart to wecom-sender.ts
 */

import { createLogger } from '@crewmeld/logger'
import { t } from '@/lib/core/server-i18n'
import { chunkForChannel } from './chunk'
import { replyMessage, sendMessage } from './feishu-client'

const logger = createLogger('FeishuSender')

/**
 * Send a Feishu text message
 */
export async function sendFeishuReply(
  appId: string,
  appSecret: string,
  receiveId: string,
  receiveIdType: 'open_id' | 'chat_id' | 'user_id',
  content: string
): Promise<void> {
  const textContent = JSON.stringify({ text: content })
  await sendMessage(appId, appSecret, receiveId, receiveIdType, 'text', textContent)
}

/**
 * Reply to a Feishu message (quoting the original message)
 */
export async function sendFeishuReplyTo(
  appId: string,
  appSecret: string,
  messageId: string,
  content: string
): Promise<void> {
  const textContent = JSON.stringify({ text: content })
  await replyMessage(appId, appSecret, messageId, 'text', textContent)
}

/**
 * Send long messages in chunks
 */
export async function sendFeishuChunked(
  appId: string,
  appSecret: string,
  receiveId: string,
  receiveIdType: 'open_id' | 'chat_id' | 'user_id',
  content: string
): Promise<void> {
  const chunks = chunkForChannel(content, 'feishu')

  for (const chunk of chunks) {
    await sendFeishuMarkdown(appId, appSecret, receiveId, receiveIdType, chunk)
  }
}

/**
 * Convert standard Markdown to the Markdown subset supported by Feishu cards
 *
 * Feishu card markdown supports: **bold**, ~~strikethrough~~, [link](url), lists, code blocks
 * Not supported: # headings, | tables |, > blockquotes, --- horizontal rules
 */
function sanitizeForFeishu(md: string): string {
  const lines = md.split('\n')
  const result: string[] = []
  let inCodeBlock = false
  let inTable = false
  /** Parsed table headers (column names), used to convert subsequent rows to lists */
  let tableHeaders: string[] = []

  for (const line of lines) {
    // No conversion inside code blocks
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      if (inTable) {
        inTable = false
        tableHeaders = []
      }
      result.push(line)
      continue
    }
    if (inCodeBlock) {
      result.push(line)
      continue
    }

    const trimmed = line.trim()

    // Headings -> bold
    const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/)
    if (headingMatch) {
      if (inTable) {
        inTable = false
        tableHeaders = []
      }
      result.push(`**${headingMatch[1]}**`)
      continue
    }

    // Table separator rows (|---|---| or | :--- | ---: |) -> skip
    if (/^\|[\s:?-]+\|/.test(trimmed) && !trimmed.replace(/[\s|:-]/g, '')) {
      continue
    }

    // Table rows
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim())

      if (!inTable) {
        // First row is the header
        inTable = true
        tableHeaders = cells
        continue
      }

      // Data rows -> output "column: value" per field
      const parts = cells.map((cell, i) => {
        const header = tableHeaders[i]
        return header ? `${header}${t('channelCardColon')}${cell}` : cell
      })
      result.push(parts.join(' | '))
      continue
    }

    // Non-table row, end table state
    if (inTable) {
      inTable = false
      tableHeaders = []
    }

    // Horizontal rules -> empty line
    if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
      result.push('')
      continue
    }

    // Blockquotes -> remove > prefix
    if (trimmed.startsWith('> ')) {
      result.push(trimmed.slice(2))
      continue
    }

    // Images -> text description (Feishu card markdown doesn't support external image URLs, requires image_key)
    result.push(
      line.replace(/!\[([^\]]*)\]\([^)]+\)/g, (_, alt) => (alt ? `[Image: ${alt}]` : '[Image]'))
    )
  }

  return result.join('\n')
}

/**
 * Send Markdown content as a message card (Feishu cards natively support Markdown rendering)
 *
 * Feishu card markdown element docs:
 * https://open.feishu.cn/document/common-capabilities/message-card/message-cards-content/using-markdown-tags
 */
export async function sendFeishuMarkdown(
  appId: string,
  appSecret: string,
  receiveId: string,
  receiveIdType: 'open_id' | 'chat_id' | 'user_id',
  content: string
): Promise<string | undefined> {
  const sanitized = sanitizeForFeishu(content)
  const card = {
    config: { wide_screen_mode: true },
    elements: [
      {
        tag: 'markdown',
        content: sanitized,
      },
    ],
  }
  return sendFeishuCard(appId, appSecret, receiveId, receiveIdType, card)
}

/**
 * Send a Feishu file (base64 -> Buffer -> upload -> send file message)
 */
export async function sendFeishuFile(
  appId: string,
  appSecret: string,
  receiveId: string,
  receiveIdType: 'open_id' | 'chat_id' | 'user_id',
  file: { name: string; base64: string }
): Promise<void> {
  const { uploadFile, sendFileMessage } = await import('./feishu-client')
  const buffer = Buffer.from(file.base64, 'base64')
  const fileKey = await uploadFile(appId, appSecret, file.name, buffer)
  await sendFileMessage(appId, appSecret, receiveId, receiveIdType, fileKey)
}

/**
 * Send a Feishu interactive message card
 */
export async function sendFeishuCard(
  appId: string,
  appSecret: string,
  receiveId: string,
  receiveIdType: 'open_id' | 'chat_id' | 'user_id',
  card: Record<string, unknown>
): Promise<string | undefined> {
  const cardContent = JSON.stringify(card)
  return sendMessage(appId, appSecret, receiveId, receiveIdType, 'interactive', cardContent)
}

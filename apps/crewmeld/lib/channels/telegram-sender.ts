/**
 * Telegram message sending service
 */

import { createLogger } from '@crewmeld/logger'
import { chunkForChannel } from './chunk'
import { proxyFetch } from './proxy-fetch'

const logger = createLogger('TelegramSender')

const TELEGRAM_API = 'https://api.telegram.org'

/**
 * Send a text message
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<number | undefined> {
  const maskedToken = `${botToken.slice(0, 6)}***${botToken.slice(-4)}`
  logger.info('Telegram sendMessage started', {
    chatId,
    textLength: text.length,
    maskedToken,
    textPreview: text.slice(0, 100),
  })

  const startMs = Date.now()
  const res = await proxyFetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  })
  const elapsedMs = Date.now() - startMs

  if (!res.ok) {
    const errText = await res.text()
    logger.error('Telegram sendMessage failed', {
      chatId,
      status: res.status,
      body: errText,
      textLength: text.length,
      elapsedMs,
    })
    throw new Error(`Telegram sendMessage failed: ${res.status} — ${errText}`)
  }

  const data = (await res.json()) as { ok: boolean; result?: { message_id: number } }
  logger.info('Telegram sendMessage succeeded', {
    chatId,
    messageId: data.result?.message_id,
    elapsedMs,
  })
  return data.result?.message_id
}

/**
 * Send a Markdown formatted message (MarkdownV2)
 */
export async function sendTelegramMarkdown(
  botToken: string,
  chatId: string,
  markdown: string
): Promise<number | undefined> {
  logger.info('Telegram sendMarkdown started', { chatId, markdownLength: markdown.length })
  const sanitized = sanitizeForTelegram(markdown)
  const startMs = Date.now()
  const res = await proxyFetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: sanitized,
      parse_mode: 'MarkdownV2',
    }),
  })
  const elapsedMs = Date.now() - startMs

  if (!res.ok) {
    const errText = await res.text().catch(() => '(unreadable)')
    // Fall back to plain text when MarkdownV2 parsing fails
    logger.warn('Telegram MarkdownV2 send failed, falling back to plain text', {
      chatId,
      status: res.status,
      body: errText.slice(0, 200),
      elapsedMs,
    })
    return sendTelegramMessage(botToken, chatId, markdown)
  }

  const data = (await res.json()) as { ok: boolean; result?: { message_id: number } }
  logger.info('Telegram sendMarkdown succeeded', {
    chatId,
    messageId: data.result?.message_id,
    elapsedMs,
  })
  return data.result?.message_id
}

/**
 * Send long messages in chunks
 */
export async function sendTelegramChunked(
  botToken: string,
  chatId: string,
  content: string
): Promise<void> {
  const chunks = chunkForChannel(content, 'telegram')
  logger.info('Telegram sendChunked started', {
    chatId,
    contentLength: content.length,
    chunkCount: chunks.length,
  })

  for (let i = 0; i < chunks.length; i++) {
    logger.info(`Telegram sendChunked sending chunk ${i + 1}/${chunks.length}`, {
      chatId,
      chunkLength: chunks[i].length,
    })
    await sendTelegramMarkdown(botToken, chatId, chunks[i])
  }

  logger.info('Telegram sendChunked completed', { chatId, chunkCount: chunks.length })
}

/**
 * Send a file (document)
 */
export async function sendTelegramDocument(
  botToken: string,
  chatId: string,
  fileBuffer: Buffer,
  fileName: string
): Promise<void> {
  const formData = new FormData()
  formData.append('chat_id', chatId)
  formData.append('document', new Blob([fileBuffer as BlobPart]), fileName)

  const res = await proxyFetch(`${TELEGRAM_API}/bot${botToken}/sendDocument`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const errText = await res.text()
    logger.error('Telegram sendDocument failed', { status: res.status, body: errText })
    throw new Error(`Telegram sendDocument failed: ${res.status}`)
  }
}

/**
 * Call setWebhook to register callback URL
 */
export async function setTelegramWebhook(
  botToken: string,
  webhookUrl: string,
  secretToken?: string
): Promise<{ ok: boolean; description?: string }> {
  const payload: Record<string, string> = { url: webhookUrl }
  if (secretToken) {
    payload.secret_token = secretToken
  }

  const res = await proxyFetch(`${TELEGRAM_API}/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  return res.json() as Promise<{ ok: boolean; description?: string }>
}

/**
 * Send a message with Inline Keyboard (approval card)
 *
 * @returns message_id (for subsequent editMessageText to update card status)
 */
export async function sendTelegramInlineKeyboard(
  botToken: string,
  chatId: string,
  text: string,
  replyMarkup: Record<string, unknown>
): Promise<number | undefined> {
  const res = await proxyFetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: replyMarkup,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    logger.error('Telegram sendMessage(InlineKeyboard) failed', {
      status: res.status,
      body: errText,
    })
    throw new Error(`Telegram sendMessage(InlineKeyboard) failed: ${res.status}`)
  }

  const data = (await res.json()) as { ok: boolean; result?: { message_id: number } }
  return data.result?.message_id
}

/**
 * Edit sent message text (for updating approval card status)
 */
export async function editTelegramMessageText(
  botToken: string,
  chatId: string,
  messageId: number,
  text: string,
  replyMarkup?: Record<string, unknown>
): Promise<void> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
  }
  if (replyMarkup) {
    payload.reply_markup = replyMarkup
  }

  const res = await proxyFetch(`${TELEGRAM_API}/bot${botToken}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errText = await res.text()
    logger.error('Telegram editMessageText failed', { status: res.status, body: errText })
    throw new Error(`Telegram editMessageText failed: ${res.status}`)
  }
}

/**
 * Answer callback_query (must be called after Inline Keyboard button click, otherwise button keeps spinning)
 */
export async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string
): Promise<void> {
  const payload: Record<string, unknown> = { callback_query_id: callbackQueryId }
  if (text) payload.text = text

  await proxyFetch(`${TELEGRAM_API}/bot${botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

/**
 * Delete webhook
 */
export async function deleteTelegramWebhook(
  botToken: string
): Promise<{ ok: boolean; description?: string }> {
  const res = await proxyFetch(`${TELEGRAM_API}/bot${botToken}/deleteWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  return res.json() as Promise<{ ok: boolean; description?: string }>
}

/**
 * Get current webhook info
 */
export async function getTelegramWebhookInfo(botToken: string): Promise<Record<string, unknown>> {
  const res = await proxyFetch(`${TELEGRAM_API}/bot${botToken}/getWebhookInfo`, {
    method: 'GET',
  })
  return res.json() as Promise<Record<string, unknown>>
}

/**
 * Escape Telegram MarkdownV2 special characters
 *
 * Characters that need escaping in MarkdownV2: _ * [ ] ( ) ~ ` > # + - = | { } . !
 * But should not escape within existing Markdown formatting (**bold**, `code`, etc.) and inline code
 */
function sanitizeForTelegram(md: string): string {
  const escapeChars = /([_[\]()~>#+=|{}.!-])/g
  const lines = md.split('\n')
  const result: string[] = []
  let inCodeBlock = false

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      result.push(line)
      continue
    }

    if (inCodeBlock) {
      result.push(line)
      continue
    }

    // Split by inline code, only escape parts outside code
    result.push(escapeOutsideInlineCode(line, escapeChars))
  }

  return result.join('\n')
}

/**
 * Split a line by inline code (`...`), only escape parts outside code
 */
function escapeOutsideInlineCode(line: string, escapeChars: RegExp): string {
  const parts = line.split('`')
  // Odd-indexed parts are inside inline code (`code` → ['', 'code', ''])
  return parts.map((part, i) => (i % 2 === 0 ? part.replace(escapeChars, '\\$1') : part)).join('`')
}

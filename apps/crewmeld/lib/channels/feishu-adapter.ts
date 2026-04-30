/**
 * Feishu channel adapter - message parsing + signature verification + Encrypt Key decryption + message sending
 *
 * Supports two security modes:
 * 1. Verification Token (signature verification)
 * 2. Encrypt Key (AES-256-CBC encryption)
 */

import crypto from 'crypto'
import { createLogger } from '@crewmeld/logger'
import { sendFeishuChunked } from './feishu-sender'
import type { ChannelAdapter } from './types'

const logger = createLogger('FeishuAdapter')

/**
 * Feishu Encrypt Key decryption
 *
 * Feishu uses AES-256-CBC to encrypt event content:
 * - key = SHA256(encryptKey)
 * - iv = first 16 bytes of ciphertext
 * - ciphertext = Base64 decoded with first 16 bytes removed
 */
function decryptFeishuEvent(encryptKey: string, encryptedContent: string): string {
  const keyBuffer = crypto.createHash('sha256').update(encryptKey).digest()
  const encrypted = Buffer.from(encryptedContent, 'base64')
  const iv = encrypted.subarray(0, 16)
  const ciphertext = encrypted.subarray(16)

  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv)
  let decrypted = decipher.update(ciphertext, undefined, 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

/**
 * Verify Feishu request signature
 *
 * X-Lark-Signature = SHA256(timestamp + nonce + encryptKey + body)
 */
function verifyFeishuSignature(
  timestamp: string,
  nonce: string,
  encryptKey: string,
  bodyText: string,
  signature: string
): boolean {
  const toVerify = `${timestamp}${nonce}${encryptKey}${bodyText}`
  const hash = crypto.createHash('sha256').update(toVerify).digest('hex')
  return hash === signature
}

/**
 * Extract text content after @bot mention from Feishu messages
 * Group @bot message format: "text": "@_user_1 query SQL"
 */
function stripMentionPrefix(text: string): string {
  // Feishu @mention format: @_user_N or plain text
  return text.replace(/^@\S+\s*/, '').trim()
}

export const feishuAdapter: ChannelAdapter = {
  async verifySignature(request, secret) {
    const timestamp = request.headers.get('X-Lark-Request-Timestamp') ?? ''
    const nonce = request.headers.get('X-Lark-Request-Nonce') ?? ''
    const signature = request.headers.get('X-Lark-Signature') ?? ''

    // Verify when signature header is present
    if (signature) {
      const body = await request.clone().text()
      return verifyFeishuSignature(timestamp, nonce, secret, body, signature)
    }

    // No signature header (Feishu doesn't send signature headers in some modes)
    return true
  },

  async parseMessage(request) {
    try {
      const bodyText = await request.text()
      let body: Record<string, unknown>

      try {
        body = JSON.parse(bodyText)
      } catch {
        logger.warn('Feishu message JSON parse failed')
        return null
      }

      // 1. URL verification challenge
      if (body.type === 'url_verification') {
        return null
      }

      // 2. Encrypt Key mode - decrypt encrypt field
      if (body.encrypt && typeof body.encrypt === 'string') {
        // Decryption needs to be handled in the webhook route (requires encryptKey),
        // marked as encrypted message here, decrypted by the route layer before calling
        return null
      }

      // 3. Feishu v2.0 event callback
      const event = body.event as Record<string, unknown> | undefined
      if (!event) return null

      const message = event.message as Record<string, unknown> | undefined
      const sender = event.sender as Record<string, unknown> | undefined

      if (!message) return null

      const msgType = message.message_type as string
      if (msgType !== 'text') {
        logger.info(`Ignoring non-text message: message_type=${msgType}`)
        return null
      }

      // Parse message content
      let content = ''
      try {
        const parsed = JSON.parse(message.content as string)
        content = parsed.text ?? ''
      } catch {
        content = (message.content as string) ?? ''
      }

      // Group messages: extract text after @bot mention
      const chatType = message.chat_type as string | undefined
      if (chatType === 'group') {
        // Check if there is a mention
        const mentions = (message.mentions ?? []) as Array<Record<string, unknown>>
        if (mentions.length === 0) {
          // Group message without @bot, ignore
          return null
        }
        content = stripMentionPrefix(content)
      }

      const senderId = sender?.sender_id as Record<string, string> | undefined
      const openId = senderId?.open_id ?? senderId?.user_id ?? ''
      const msgId = (message.message_id as string) ?? `feishu-${Date.now()}`
      const chatId = message.chat_id as string | undefined

      if (!content || !openId) return null

      return {
        channel: 'feishu' as const,
        externalUserId: openId,
        externalSessionId: chatId,
        messageId: msgId,
        content: content.trim(),
        messageType: 'text' as const,
        timestamp: Number(message.create_time) || Date.now(),
        rawPayload: body,
      }
    } catch (error) {
      logger.error('Failed to parse Feishu message', error)
      return null
    }
  },

  async buildVerificationResponse(request, token) {
    try {
      const body = await request.clone().json()
      if (body.type === 'url_verification') {
        return Response.json({ challenge: body.challenge })
      }
    } catch {
      // Not a verification request
    }
    return null
  },

  async sendReply(message, reply, config) {
    if (!config.appId || !config.appSecret) {
      logger.warn('Feishu reply failed: missing appId/appSecret')
      return
    }

    // Determine reply target: group uses chat_id, direct message uses open_id
    const chatType = (message.rawPayload as Record<string, unknown>)?.event
      ? ((message.rawPayload as Record<string, unknown>).event as Record<string, unknown>)?.message
        ? ((
            ((message.rawPayload as Record<string, unknown>).event as Record<string, unknown>)
              .message as Record<string, unknown>
          )?.chat_type as string | undefined)
        : undefined
      : undefined

    const receiveId =
      chatType === 'group' && message.externalSessionId
        ? message.externalSessionId
        : message.externalUserId

    const receiveIdType =
      chatType === 'group' && message.externalSessionId
        ? ('chat_id' as const)
        : ('open_id' as const)

    await sendFeishuChunked(config.appId, config.appSecret, receiveId, receiveIdType, reply.content)
  },
}

/**
 * Decrypt Feishu encrypted events (exported for webhook route use)
 */
export function decryptEncryptedEvent(
  encryptKey: string,
  encryptedContent: string
): Record<string, unknown> {
  const decrypted = decryptFeishuEvent(encryptKey, encryptedContent)
  return JSON.parse(decrypted)
}

/**
 * WeCom channel adapter - encrypted XML parsing + 4-param signature verification
 */

import { createLogger } from '@crewmeld/logger'
import type { ChannelAdapter, ChannelConfig } from './types'
import { decryptWeComMessage, generateWeComSignature } from './wecom-crypto'

const logger = createLogger('WecomAdapter')

/**
 * WeCom channel config (extends generic ChannelConfig)
 */
export interface WeComChannelConfig extends ChannelConfig {
  corpId: string
  corpSecret: string
  agentId: string
}

/**
 * Simple XML text extraction (avoids importing a full XML parser)
 */
export function extractXmlTag(xml: string, tag: string): string {
  const cdataOpen = `<${tag}><![CDATA[`
  const cdataClose = `]]></${tag}>`

  const cdataStart = xml.indexOf(cdataOpen)
  if (cdataStart !== -1) {
    const contentStart = cdataStart + cdataOpen.length
    const contentEnd = xml.indexOf(cdataClose, contentStart)
    if (contentEnd !== -1) {
      return xml.slice(contentStart, contentEnd)
    }
  }

  const openTag = `<${tag}>`
  const closeTag = `</${tag}>`
  const start = xml.indexOf(openTag)
  if (start !== -1) {
    const contentStart = start + openTag.length
    const end = xml.indexOf(closeTag, contentStart)
    if (end !== -1) {
      return xml.slice(contentStart, end)
    }
  }

  return ''
}

export const wecomAdapter: ChannelAdapter = {
  /**
   * 4-param signature verification: extract <Encrypt> from XML body, SHA1 compare with token+timestamp+nonce against msg_signature
   */
  async verifySignature(request, secret) {
    const url = new URL(request.url)
    const msgSignature = url.searchParams.get('msg_signature') ?? ''
    const timestamp = url.searchParams.get('timestamp') ?? ''
    const nonce = url.searchParams.get('nonce') ?? ''

    const body = await request.text()
    const encrypt = extractXmlTag(body, 'Encrypt')
    if (!encrypt) {
      logger.warn('Signature verification: <Encrypt> tag not found')
      return false
    }

    const expected = generateWeComSignature(secret, timestamp, nonce, encrypt)
    return expected === msgSignature
  },

  /**
   * Parse encrypted message: verify signature -> decrypt <Encrypt> -> extract fields from decrypted XML
   */
  async parseMessage(request) {
    try {
      const body = request.headers.get('x-wecom-body') ?? (await request.text())
      const encrypt = extractXmlTag(body, 'Encrypt')
      if (!encrypt) {
        logger.warn('Message parsing: <Encrypt> tag not found')
        return null
      }

      const encodingAESKey = request.headers.get('x-wecom-encoding-aes-key')
      if (!encodingAESKey) {
        logger.warn('Message parsing: missing encodingAESKey')
        return null
      }

      const { message: decryptedXml } = decryptWeComMessage(encodingAESKey, encrypt)

      const msgType = extractXmlTag(decryptedXml, 'MsgType')

      if (msgType === 'event') {
        const event = extractXmlTag(decryptedXml, 'Event')
        const eventKey = extractXmlTag(decryptedXml, 'EventKey')
        const taskId = extractXmlTag(decryptedXml, 'TaskId')
        const fromUser = extractXmlTag(decryptedXml, 'FromUserName')

        return {
          channel: 'wecom' as const,
          externalUserId: fromUser,
          messageId: `wecom-event-${Date.now()}`,
          content: '',
          messageType: 'event' as const,
          timestamp: Date.now(),
          rawPayload: { body: decryptedXml, event, eventKey, taskId },
        }
      }

      if (msgType !== 'text') {
        logger.info(`Ignoring non-text message: MsgType=${msgType}`)
        return null
      }

      const content = extractXmlTag(decryptedXml, 'Content')
      const fromUser = extractXmlTag(decryptedXml, 'FromUserName')
      const msgId = extractXmlTag(decryptedXml, 'MsgId')
      const createTime = extractXmlTag(decryptedXml, 'CreateTime')

      if (!content || !fromUser) return null

      return {
        channel: 'wecom' as const,
        externalUserId: fromUser,
        messageId: msgId || `wecom-${Date.now()}`,
        content,
        messageType: 'text' as const,
        timestamp: Number(createTime) * 1000 || Date.now(),
        rawPayload: { body: decryptedXml },
      }
    } catch (error) {
      logger.error('Failed to parse WeCom message', error)
      return null
    }
  },

  /**
   * URL verification callback: decrypt echostr and return plaintext
   */
  async buildVerificationResponse(request, token) {
    const url = new URL(request.url)
    const echostr = url.searchParams.get('echostr')
    if (!echostr) return null

    const encodingAESKey = request.headers.get('x-wecom-encoding-aes-key')
    if (encodingAESKey) {
      try {
        const { message: decrypted } = decryptWeComMessage(encodingAESKey, echostr)
        return new Response(decrypted, { status: 200, headers: { 'Content-Type': 'text/plain' } })
      } catch (error) {
        logger.error('echostr decryption failed', error)
      }
    }

    return new Response(echostr, { status: 200 })
  },

  /**
   * Send reply (implemented by sendWeComChunked in wecom-sender.ts)
   */
  async sendReply(message, reply, config) {
    const { sendWeComChunked } = await import('./wecom-sender')
    const wecomConfig = config as WeComChannelConfig
    await sendWeComChunked(
      wecomConfig.corpId,
      wecomConfig.corpSecret,
      wecomConfig.agentId,
      message.externalUserId,
      reply.content
    )
  },
}

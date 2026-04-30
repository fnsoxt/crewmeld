/**
 * WeChat Official Account channel plugin
 *
 * Key differences from WeCom:
 * 1. Signature verification: 3-parameter SHA1 (not 4-parameter)
 * 2. Reply method: Customer Service Message API async push (must return "success" within 5s)
 * 3. User identifier: openId (not userId)
 * 4. Message format: XML (plaintext or security-mode AES encrypted)
 * 5. No card messages, no approval flow
 */

import { t } from '@/lib/core/server-i18n'
import type { ChannelPlugin } from '../../plugin-types'
import type { ChannelMessage } from '../../types'
import { CHANNEL_MAX_LENGTH } from '../../types'
import { extractXmlTag } from '../../wecom-adapter'
import {
  decryptWxoaMessage,
  generateWxoaEncryptSignature,
  generateWxoaSignature,
} from '../../wxoa-crypto'
import { type WxoaPluginConfig, wxoaPluginConfigSchema } from './types'

export const wxoaPlugin: ChannelPlugin<WxoaPluginConfig> = {
  id: 'wxoa',
  label: t('channelPluginWxoa'),
  aliases: ['wechat_oa', 'mp', 'official_account'],

  capabilities: {
    direct: true,
    channel: false,
    threads: false,
    media: true,
    reactions: false,
    editing: false,
    replies: false,
    cards: false,
    websocket: false,
  },

  configSchema: wxoaPluginConfigSchema,

  inbound: {
    async verifySignature(request, bodyText, config) {
      const url = new URL(request.url)
      const timestamp = url.searchParams.get('timestamp') ?? ''
      const nonce = url.searchParams.get('nonce') ?? ''

      // Security mode: 4-parameter signature (with encrypted content)
      if (config.encodingAESKey) {
        const msgSignature = url.searchParams.get('msg_signature') ?? ''
        const encryptedContent = extractXmlTag(bodyText, 'Encrypt')
        if (encryptedContent && msgSignature) {
          const expected = generateWxoaEncryptSignature(
            config.token,
            timestamp,
            nonce,
            encryptedContent
          )
          return expected === msgSignature
        }
      }

      // Plaintext mode: 3-parameter signature
      const signature = url.searchParams.get('signature') ?? ''
      const expected = generateWxoaSignature(config.token, timestamp, nonce)
      return expected === signature
    },

    async handleVerification(body, config) {
      // URL verification handled via GET request, not this method
      return null
    },

    decryptPayload(body, config) {
      // Decryption handled uniformly in parseMessage
      return null
    },

    parseMessage(body, config): ChannelMessage | null {
      const rawXml = body.__rawXml as string | undefined
      if (!rawXml) return null

      let xml = rawXml

      // Security mode: decrypt first
      if (config.encodingAESKey) {
        const encryptedContent = extractXmlTag(rawXml, 'Encrypt')
        if (encryptedContent) {
          const { message: decryptedXml } = decryptWxoaMessage(
            config.encodingAESKey,
            encryptedContent
          )
          xml = decryptedXml
        }
      }

      const msgType = extractXmlTag(xml, 'MsgType')
      const fromUser = extractXmlTag(xml, 'FromUserName')
      const msgId = extractXmlTag(xml, 'MsgId') || `wxoa-${Date.now()}`
      const createTime = extractXmlTag(xml, 'CreateTime')

      // Event messages: subscribe, unsubscribe, menu click, etc.
      if (msgType === 'event') {
        const event = extractXmlTag(xml, 'Event')
        const eventKey = extractXmlTag(xml, 'EventKey')

        if (!fromUser) return null

        // Subscribe event: return welcome message
        if (event === 'subscribe') {
          return {
            channel: 'wxoa',
            externalUserId: fromUser,
            messageId: `wxoa-subscribe-${Date.now()}`,
            content: `[${t('channelWxoaUserFollowed')}]`,
            messageType: 'event',
            timestamp: Number(createTime) * 1000 || Date.now(),
            rawPayload: { body: xml, event, eventKey },
          }
        }

        // Unsubscribe event: no reply needed
        if (event === 'unsubscribe') {
          return null
        }

        // Menu click event
        if (event === 'CLICK') {
          return {
            channel: 'wxoa',
            externalUserId: fromUser,
            messageId: `wxoa-click-${Date.now()}`,
            content: eventKey || `[${t('channelWxoaMenuClick')}]`,
            messageType: 'event',
            timestamp: Number(createTime) * 1000 || Date.now(),
            rawPayload: { body: xml, event, eventKey },
          }
        }

        return null
      }

      // Text message
      if (msgType === 'text') {
        const content = extractXmlTag(xml, 'Content')
        if (!content || !fromUser) return null

        return {
          channel: 'wxoa',
          externalUserId: fromUser,
          messageId: msgId,
          content,
          messageType: 'text',
          timestamp: Number(createTime) * 1000 || Date.now(),
          rawPayload: { body: xml },
        }
      }

      // Image message
      if (msgType === 'image') {
        const picUrl = extractXmlTag(xml, 'PicUrl')
        if (!fromUser) return null

        return {
          channel: 'wxoa',
          externalUserId: fromUser,
          messageId: msgId,
          content: `[User sent an image${picUrl ? `: ${picUrl}` : ''}]`,
          messageType: 'image',
          timestamp: Number(createTime) * 1000 || Date.now(),
          rawPayload: { body: xml },
        }
      }

      // Voice message
      if (msgType === 'voice') {
        const recognition = extractXmlTag(xml, 'Recognition')
        if (!fromUser) return null

        return {
          channel: 'wxoa',
          externalUserId: fromUser,
          messageId: msgId,
          content:
            recognition ||
            '[User sent a voice message. Only text messages are currently supported]',
          messageType: 'voice',
          timestamp: Number(createTime) * 1000 || Date.now(),
          rawPayload: { body: xml },
        }
      }

      // Other unsupported message types
      if (fromUser && msgType) {
        const typeNames: Record<string, string> = {
          video: 'video',
          shortvideo: 'short video',
          location: 'location',
          link: 'link',
        }
        const typeName = typeNames[msgType] ?? msgType
        return {
          channel: 'wxoa',
          externalUserId: fromUser,
          messageId: msgId,
          content: `[User sent a ${typeName} message. Only text messages are currently supported. Please send your content as text]`,
          messageType: 'text',
          timestamp: Number(createTime) * 1000 || Date.now(),
          rawPayload: { body: xml },
        }
      }

      return null
    },

    // Official Account does not support card callbacks
    parseCardAction() {
      return null
    },
  },

  outbound: {
    deliveryMode: 'direct',
    chunkerMode: 'text',
    textChunkLimit: CHANNEL_MAX_LENGTH.wxoa,

    async sendText(params, config) {
      const { sendWxoaChunked } = await import('../../wxoa-sender')
      await sendWxoaChunked(config.appId, config.appSecret, params.receiveId, params.content)
    },

    // Official Account does not support cards
  },
}

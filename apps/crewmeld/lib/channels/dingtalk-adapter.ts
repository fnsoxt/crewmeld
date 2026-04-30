/**
 * DingTalk channel adapter - JSON parsing + HmacSHA256 signature verification
 */

import crypto from 'crypto'
import { createLogger } from '@crewmeld/logger'
import type { ChannelAdapter } from './types'

const logger = createLogger('DingtalkAdapter')

export const dingtalkAdapter: ChannelAdapter = {
  async verifySignature(request, secret) {
    const timestamp = request.headers.get('timestamp') ?? ''
    const sign = request.headers.get('sign') ?? ''

    const stringToSign = `${timestamp}\n${secret}`
    const hmac = crypto.createHmac('sha256', secret).update(stringToSign).digest('base64')

    return hmac === sign
  },

  async parseMessage(request) {
    try {
      const body = await request.json()

      // DingTalk message format
      const msgType = body.msgtype
      if (msgType !== 'text') {
        logger.info(`Ignoring non-text message: msgtype=${msgType}`)
        return null
      }

      const content = body.text?.content?.trim()
      const senderStaffId = body.senderStaffId ?? body.senderId ?? ''
      const msgId = body.msgId ?? `dingtalk-${Date.now()}`
      const conversationId = body.conversationId

      if (!content || !senderStaffId) return null

      return {
        channel: 'dingtalk' as const,
        externalUserId: senderStaffId,
        externalSessionId: conversationId,
        messageId: msgId,
        content,
        messageType: 'text' as const,
        timestamp: body.createAt ?? Date.now(),
        rawPayload: body,
      }
    } catch (error) {
      logger.error('Failed to parse DingTalk message', error)
      return null
    }
  },

  async sendReply(message, reply, config) {
    logger.info(`DingTalk reply message: userId=${message.externalUserId}`)
    // Actual implementation needs to call DingTalk API to send messages
    // POST https://oapi.dingtalk.com/robot/send
    // This is a placeholder implementation, to be completed during integration
  },
}

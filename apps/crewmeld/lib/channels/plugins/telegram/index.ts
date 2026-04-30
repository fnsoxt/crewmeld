/**
 * Telegram channel plugin - ChannelPlugin implementation
 */

import { createLogger } from '@crewmeld/logger'
import { t } from '@/lib/core/server-i18n'
import type { CardActionEvent, ChannelPlugin } from '../../plugin-types'
import {
  buildApprovalCard as buildTgApprovalCard,
  buildApprovalDoneCard as buildTgApprovalDoneCard,
} from '../../telegram-card-builder'
import type { ChannelMessage } from '../../types'
import { CHANNEL_MAX_LENGTH } from '../../types'
import { type TelegramPluginConfig, type TelegramUpdate, telegramPluginConfigSchema } from './types'

const logger = createLogger('TelegramPlugin')

/**
 * Parse callback_data format: approval_{pauseId}_{action}
 */
function parseApprovalCallbackData(data: string): { pauseId: string; action: string } | null {
  const match = data.match(/^approval_(.+)_(approved|rejected)$/)
  if (!match) return null
  return { pauseId: match[1], action: match[2] }
}

export const telegramPlugin: ChannelPlugin<TelegramPluginConfig> = {
  id: 'telegram',
  label: 'Telegram',
  aliases: ['tg'],

  capabilities: {
    direct: true,
    channel: true,
    threads: false,
    media: true,
    reactions: false,
    editing: true,
    replies: true,
    cards: true,
    websocket: false,
  },

  configSchema: telegramPluginConfigSchema,

  inbound: {
    async verifySignature(
      request: Request,
      _bodyText: string,
      config: TelegramPluginConfig
    ): Promise<boolean> {
      // Telegram uses X-Telegram-Bot-Api-Secret-Token header for verification
      if (!config.telegramWebhookSecret) {
        return true // Skip verification if secret is not configured
      }
      const secretHeader = request.headers.get('x-telegram-bot-api-secret-token')
      return secretHeader === config.telegramWebhookSecret
    },

    parseCardAction(
      body: Record<string, unknown>,
      config: TelegramPluginConfig
    ): CardActionEvent | null {
      const update = body as unknown as TelegramUpdate
      const cbq = update.callback_query
      if (!cbq?.data) return null

      const parsed = parseApprovalCallbackData(cbq.data)
      if (!parsed) return null

      // Asynchronously answer callback_query (prevent button spinner)
      import('../../telegram-sender').then(({ answerCallbackQuery }) => {
        answerCallbackQuery(
          config.telegramBotToken,
          cbq.id,
          parsed.action === 'approved' ? t('channelTelegramApproved') : t('channelTelegramRejected')
        ).catch((err) => logger.warn('answerCallbackQuery failed', { error: err }))
      })

      return {
        action: parsed.action,
        pauseId: parsed.pauseId,
        operatorId: String(cbq.from.id),
        messageId: cbq.message ? String(cbq.message.message_id) : undefined,
        // Store chat_id in taskId for updateCard use (Telegram has no native taskId)
        taskId: cbq.message ? String(cbq.message.chat.id) : undefined,
        rawPayload: body,
      }
    },

    parseMessage(
      body: Record<string, unknown>,
      config: TelegramPluginConfig
    ): ChannelMessage | null {
      const update = body as unknown as TelegramUpdate

      // callback_query is not a regular message, handled by parseCardAction
      if (update.callback_query) return null

      const msg = update.message ?? update.edited_message

      if (!msg) {
        logger.debug('Telegram update has no message field, skipping')
        return null
      }

      // Skip messages sent by the bot itself
      if (msg.from?.is_bot) {
        return null
      }

      const base = {
        channel: 'telegram' as const,
        externalUserId: String(msg.from?.id ?? msg.chat.id),
        externalSessionId: String(msg.chat.id),
        messageId: `tg_${update.update_id}`,
        timestamp: msg.date * 1000,
        rawPayload: body,
        senderName:
          [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || undefined,
      }

      // File message: document
      if (msg.document) {
        const fileName = msg.document.file_name || 'unknown'
        const textContent = msg.caption
          ? `${msg.caption}; [User sent a file: ${fileName}]`
          : `[User sent a file: ${fileName}]`
        return {
          ...base,
          content: textContent,
          messageType: 'file',
          _pendingFile: {
            fileName,
            fileId: msg.document.file_id,
            botToken: config.telegramBotToken,
          },
        } as ChannelMessage & { _pendingFile: Record<string, string> }
      }

      // Photo message: get the largest size
      if (msg.photo && msg.photo.length > 0) {
        const largest = msg.photo[msg.photo.length - 1]
        const fileName = `photo_${largest.file_id.slice(0, 8)}.jpg`
        const textContent = msg.caption
          ? `${msg.caption}; [User sent a file: ${fileName}]`
          : `[User sent a file: ${fileName}]`
        return {
          ...base,
          content: textContent,
          messageType: 'file',
          _pendingFile: { fileName, fileId: largest.file_id, botToken: config.telegramBotToken },
        } as ChannelMessage & { _pendingFile: Record<string, string> }
      }

      // Voice message
      if (msg.voice) {
        const fileName = `voice_${msg.voice.file_id.slice(0, 8)}.ogg`
        return {
          ...base,
          content: `[User sent a file: ${fileName}]`,
          messageType: 'file',
          _pendingFile: { fileName, fileId: msg.voice.file_id, botToken: config.telegramBotToken },
        } as ChannelMessage & { _pendingFile: Record<string, string> }
      }

      // Plain text message
      const content = msg.text ?? msg.caption ?? ''
      if (!content) {
        logger.debug('Telegram message has no text content, skipping')
        return null
      }

      return {
        ...base,
        content,
        messageType: 'text',
      }
    },
  },

  outbound: {
    deliveryMode: 'direct',
    chunkerMode: 'markdown',
    textChunkLimit: CHANNEL_MAX_LENGTH.telegram,

    async sendText(params, config) {
      const { sendTelegramMessage } = await import('../../telegram-sender')
      await sendTelegramMessage(config.telegramBotToken, params.receiveId, params.content)
    },

    async sendFile(params, config) {
      const { sendTelegramDocument } = await import('../../telegram-sender')
      const buffer = Buffer.from(params.file.base64, 'base64')
      await sendTelegramDocument(
        config.telegramBotToken,
        params.receiveId,
        buffer,
        params.file.name
      )
    },

    async sendCard(params, config) {
      const { sendTelegramInlineKeyboard } = await import('../../telegram-sender')
      const card = params.card as { text?: string; reply_markup?: Record<string, unknown> }
      const messageId = await sendTelegramInlineKeyboard(
        config.telegramBotToken,
        params.receiveId,
        (card.text as string) ?? '',
        (card.reply_markup as Record<string, unknown>) ?? { inline_keyboard: [] }
      )
      return messageId ? String(messageId) : undefined
    },

    async updateCard(params, config) {
      const { editTelegramMessageText } = await import('../../telegram-sender')
      const card = params.card as { text?: string; reply_markup?: Record<string, unknown> }
      // params.messageId is the Telegram message_id (numeric string)
      // chatId in updateCard needs to come from toUser (operatorId -> DM) or storage
      // Telegram editMessageText can use inline_message_id or chat_id + message_id
      // Here toUser is actually the chat_id from callback_query (passed via webhook context)
      await editTelegramMessageText(
        config.telegramBotToken,
        params.toUser ?? '',
        Number(params.messageId),
        (card.text as string) ?? '',
        card.reply_markup as Record<string, unknown> | undefined
      )
    },
  },

  buildApprovalCard(params) {
    return buildTgApprovalCard(params)
  },

  buildApprovalDoneCard(params) {
    return buildTgApprovalDoneCard(params)
  },
}

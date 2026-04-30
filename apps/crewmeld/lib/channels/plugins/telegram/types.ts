/**
 * Telegram plugin config types + Zod schema
 */

import { z } from 'zod'

export const telegramPluginConfigSchema = z.object({
  telegramBotToken: z.string().min(1),
  telegramWebhookSecret: z.string().optional(),
  boundEmployeeId: z.string().optional(),
  webhookUrl: z.string().optional(),
})

export type TelegramPluginConfig = z.infer<typeof telegramPluginConfigSchema>

/**
 * Telegram Update object (simplified, covers common fields only)
 */
export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

export interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  date: number
  text?: string
  caption?: string
  document?: TelegramDocument
  photo?: TelegramPhotoSize[]
  voice?: { file_id: string; duration: number }
}

export interface TelegramUser {
  id: number
  is_bot: boolean
  first_name: string
  last_name?: string
  username?: string
}

export interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string
  username?: string
}

export interface TelegramDocument {
  file_id: string
  file_name?: string
  mime_type?: string
  file_size?: number
}

export interface TelegramPhotoSize {
  file_id: string
  width: number
  height: number
  file_size?: number
}

export interface TelegramCallbackQuery {
  id: string
  from: TelegramUser
  message?: TelegramMessage
  data?: string
}

/**
 * Channel adapter type definitions
 *
 * @deprecated Use the ChannelPlugin interface in plugin-types.ts instead.
 * This file is kept for backward compatibility; ChannelMessage / CHANNEL_MAX_LENGTH are still referenced by the new plugin system.
 */

import type { ConversationChannel } from '@crewmeld/db/schema'

/**
 * Unified message format - standardized output after channel adapters parse raw requests
 */
/**
 * File attachment (file content carried by channel messages)
 */
export interface ChannelFileAttachment {
  /** Original file name */
  fileName: string
  /** File text content (text files only) */
  textContent: string
}

export interface ChannelMessage {
  channel: ConversationChannel
  externalUserId: string
  externalSessionId?: string
  messageId: string
  content: string
  messageType: 'text' | 'image' | 'voice' | 'event' | 'file'
  timestamp: number
  rawPayload: Record<string, unknown>
  /** Attached file content (text files will be parsed) */
  fileAttachments?: ChannelFileAttachment[]
  /** Sender display name (queried from channel API, may be empty) */
  senderName?: string
}

/**
 * Channel reply
 */
export interface ChannelReply {
  content: string
  messageType: 'text' | 'markdown'
}

/**
 * Channel adapter interface - each IM channel implements this interface
 */
export interface ChannelAdapter {
  /**
   * Verify request signature
   */
  verifySignature(request: Request, secret: string): Promise<boolean>

  /**
   * Parse raw request into unified message format
   */
  parseMessage(request: Request): Promise<ChannelMessage | null>

  /**
   * Build verification response (URL verification challenge)
   */
  buildVerificationResponse?(request: Request, token: string): Promise<Response | null>

  /**
   * Send reply message
   */
  sendReply(message: ChannelMessage, reply: ChannelReply, config: ChannelConfig): Promise<void>
}

/**
 * Channel configuration
 */
export interface ChannelConfig {
  appId: string
  appSecret: string
  token: string
  encodingAesKey?: string
  webhookUrl?: string
}

/**
 * Channel message length limits
 */
export const CHANNEL_MAX_LENGTH: Record<ConversationChannel, number> = {
  web: 100000,
  wecom: 2048,
  dingtalk: 20000,
  feishu: 30000,
  discord: 20000,
  telegram: 4096,
  api: 100000,
  wxoa: 2048,
  email: 100000,
}

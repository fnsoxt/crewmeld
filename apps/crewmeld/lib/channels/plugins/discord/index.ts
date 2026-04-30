/**
 * Discord channel plugin - full implementation
 *
 * Delivery mode: direct (async push via REST API)
 * Message receiving: via Gateway WebSocket (see gateway.ts)
 * Proxy: via HTTPS_PROXY environment variable
 */

import { createLogger } from '@crewmeld/logger'
import type { ApprovalCardParams, ApprovalDoneCardParams, ChannelPlugin } from '../../plugin-types'
import type { ChannelMessage } from '../../types'
import { CHANNEL_MAX_LENGTH } from '../../types'
import { discordFetch } from './fetch'
import { type DiscordPluginConfig, discordPluginConfigSchema } from './types'

const logger = createLogger('DiscordPlugin')

/**
 * Send long text in chunks according to Discord's 2000 character limit
 */
async function sendDiscordChunked(
  channelId: string,
  content: string,
  botToken: string
): Promise<void> {
  const limit = CHANNEL_MAX_LENGTH.discord
  const chunks: string[] = []

  let remaining = content
  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining)
      break
    }
    let cutPos = remaining.lastIndexOf('\n', limit)
    if (cutPos < limit * 0.5) cutPos = limit
    chunks.push(remaining.slice(0, cutPos))
    remaining = remaining.slice(cutPos)
  }

  for (const chunk of chunks) {
    const res = await discordFetch(`/channels/${channelId}/messages`, botToken, {
      method: 'POST',
      body: JSON.stringify({ content: chunk }),
    })
    if (!res.ok) {
      logger.error('Discord message send failed', { channelId, status: res.status, body: res.body })
    }
  }
}

export const discordPlugin: ChannelPlugin<DiscordPluginConfig> = {
  id: 'discord',
  label: 'Discord',
  aliases: ['discord-bot'],

  capabilities: {
    direct: true,
    channel: true,
    threads: true,
    media: true,
    reactions: true,
    editing: true,
    replies: true,
    cards: false,
    websocket: true,
  },

  configSchema: discordPluginConfigSchema,

  inbound: {
    async verifySignature(_request, _bodyText, _config) {
      return true
    },

    parseCardAction(body, _config) {
      if (!body.__discordInteraction) return null

      const customId = body.custom_id as string | undefined
      if (!customId?.startsWith('approval:')) return null

      const parts = customId.split(':')
      if (parts.length < 3) return null

      const pauseId = parts[1]
      const action = parts[2]
      const token = parts[3] || undefined
      const operatorId = body.user_id as string
      const messageId = body.message_id as string | undefined

      return {
        action,
        pauseId,
        token,
        operatorId,
        messageId,
        rawPayload: body,
      }
    },

    parseMessage(body, config): ChannelMessage | null {
      // body is forwarded by Gateway, structure is the d field of Discord MESSAGE_CREATE event
      const author = body.author as Record<string, unknown> | undefined
      if (!author) return null

      // Ignore bot's own messages
      if (author.bot) return null

      const content = (body.content as string)?.trim()
      const messageId = (body.id as string) ?? `discord-${Date.now()}`
      const userId = author.id as string
      const channelId = body.channel_id as string
      const guildId = body.guild_id as string | undefined

      // If guildId filter is configured, only process messages from the specified server
      if (config.guildId && guildId !== config.guildId) return null

      // If channelId filter is configured, only process messages from the specified channel
      if (config.discordChannelId && channelId !== config.discordChannelId) return null

      const attachments = body.attachments as Array<Record<string, unknown>> | undefined

      if (!content && (!attachments || attachments.length === 0)) return null

      const base = {
        channel: 'discord' as const,
        externalUserId: userId,
        externalSessionId: channelId,
        messageId,
        timestamp: body.timestamp ? new Date(body.timestamp as string).getTime() : Date.now(),
        rawPayload: body,
        senderName: (author.global_name as string) || (author.username as string) || undefined,
      }

      // File/media message: take first downloadable attachment, append remaining filenames in text (aligned with telegram)
      if (attachments && attachments.length > 0) {
        const first = attachments[0]
        const fileUrl = first.url as string | undefined
        if (fileUrl) {
          const contentType = (first.content_type as string) ?? ''
          let fileName = (first.filename as string) || 'unknown'
          // Fallback naming for images/voice (consistent with telegram style)
          if (!first.filename) {
            if (contentType.startsWith('image/')) {
              const ext = contentType.split('/')[1] || 'jpg'
              fileName = `photo_${messageId.slice(0, 8)}.${ext}`
            } else if (contentType.startsWith('audio/')) {
              const ext = contentType.split('/')[1] || 'ogg'
              fileName = `voice_${messageId.slice(0, 8)}.${ext}`
            }
          }

          const extraNames = attachments
            .slice(1)
            .map((a) => a.filename as string)
            .filter(Boolean)
          const fileLabel =
            extraNames.length > 0
              ? `[User sent files: ${fileName}, ${extraNames.join(', ')}]`
              : `[User sent a file: ${fileName}]`
          const textContent = content ? `${content}; ${fileLabel}` : fileLabel

          return {
            ...base,
            content: textContent,
            messageType: 'file',
            _pendingFile: { fileName, url: fileUrl },
          } as ChannelMessage & { _pendingFile: Record<string, string> }
        }

        // Attachments without URL, only concatenate filename info
        const attachmentInfo = attachments.map((a) => a.filename).join(', ')
        const fallback = content
          ? `${content}; [User sent an attachment: ${attachmentInfo}]`
          : `[User sent an attachment: ${attachmentInfo}]`
        return {
          ...base,
          content: fallback,
          messageType: 'text',
        }
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
    textChunkLimit: CHANNEL_MAX_LENGTH.discord,

    async sendText(params, config) {
      const channelId = params.receiveId
      if (!channelId || !config.botToken) return

      await sendDiscordChunked(channelId, params.content, config.botToken)
      logger.info('Discord message sent', { channelId })
    },

    async sendFile(params, config) {
      if (!config.botToken) return
      const channelId = params.receiveId

      // Discord file upload via multipart/form-data
      const boundary = `----FormBoundary${Date.now()}`
      const fileBuffer = Buffer.from(params.file.base64, 'base64')

      const bodyParts = [
        `--${boundary}\r\n`,
        `Content-Disposition: form-data; name="files[0]"; filename="${params.file.name}"\r\n`,
        `Content-Type: ${params.file.mimeType}\r\n\r\n`,
      ]
      const bodyEnd = `\r\n--${boundary}--\r\n`

      const bodyBuffer = Buffer.concat([
        Buffer.from(bodyParts.join('')),
        fileBuffer,
        Buffer.from(bodyEnd),
      ])

      const res = await discordFetch(`/channels/${channelId}/messages`, config.botToken, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body: bodyBuffer.toString(),
      })
      if (!res.ok) {
        logger.error('Discord file send failed', { channelId, status: res.status })
      }
    },

    async sendCard(params, config) {
      if (!config.botToken) return undefined

      let channelId = params.receiveId
      const receiveIdType = params.receiveIdType ?? 'channel_id'

      // If receiveId is a user ID, need to create DM channel first
      if (receiveIdType === 'user_id') {
        const dmRes = await discordFetch('/users/@me/channels', config.botToken, {
          method: 'POST',
          body: JSON.stringify({ recipient_id: params.receiveId }),
        })

        if (!dmRes.ok) {
          logger.error('Discord DM channel creation failed', {
            userId: params.receiveId,
            status: dmRes.status,
            body: dmRes.body,
          })
          return undefined
        }

        const dmData = dmRes.json<Record<string, string>>()
        channelId = dmData.id
      }

      // Send card message
      const res = await discordFetch(`/channels/${channelId}/messages`, config.botToken, {
        method: 'POST',
        body: JSON.stringify(params.card),
      })

      if (!res.ok) {
        logger.error('Discord approval card send failed', {
          channelId,
          status: res.status,
          body: res.body,
        })
        return undefined
      }

      const data = res.json<Record<string, string>>()
      return `${channelId}:${data.id}`
    },

    async updateCard(params, config) {
      if (!config.botToken || !params.messageId) return

      // Extract channelId and messageId from messageId
      // Format may be "channelId:messageId" or just messageId
      let channelId: string | undefined
      let messageId: string

      if (params.messageId.includes(':')) {
        const [ch, msg] = params.messageId.split(':')
        channelId = ch
        messageId = msg
      } else {
        messageId = params.messageId
      }

      // If no channelId, need to get it from card's rawPayload
      if (!channelId) {
        const rawPayload = params.card?._rawPayload as Record<string, string> | undefined
        channelId = rawPayload?.channel_id
      }

      if (!channelId) {
        logger.warn('Discord card update skipped: missing channelId')
        return
      }

      // Edit original message: remove buttons, update Embed
      const res = await discordFetch(
        `/channels/${channelId}/messages/${messageId}`,
        config.botToken,
        {
          method: 'PATCH',
          body: JSON.stringify(params.card),
        }
      )

      if (!res.ok) {
        logger.warn('Discord card update failed', { messageId, status: res.status })
      }
    },
  },

  buildApprovalCard(params: ApprovalCardParams): Record<string, unknown> {
    const { buildApprovalCard } =
      require('../../discord-card-builder') as typeof import('../../discord-card-builder')
    return buildApprovalCard({
      sopName: params.sopName,
      nodeName: params.nodeName,
      previousResult: params.previousResult,
      pauseId: params.pauseId,
      approvalToken: params.approvalToken ?? '',
      senderName: params.senderName,
      approvalPageUrl: params.approvalPageUrl,
      language: params.language,
    })
  },

  buildApprovalDoneCard(params: ApprovalDoneCardParams): Record<string, unknown> {
    const { buildApprovalDoneCard } =
      require('../../discord-card-builder') as typeof import('../../discord-card-builder')
    return buildApprovalDoneCard({
      sopName: params.sopName,
      nodeName: params.nodeName,
      decision: params.decision,
      decidedBy: params.decidedBy,
      senderName: params.senderName,
      previousResult: params.previousResult,
      decidedAt: params.decidedAt,
    })
  },
}

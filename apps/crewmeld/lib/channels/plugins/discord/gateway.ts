/**
 * Discord Gateway manager
 *
 * Manages the WebSocket persistent connection for Discord Bot.
 * Supports:
 * - Auto-connect when adding/modifying a channel
 * - Disconnect when deleting a channel
 * - Heartbeat keepalive + auto-reconnect
 * - Connection via HTTPS_PROXY proxy
 * - Forwarding received messages to the standard webhook pipeline
 */

import { createLogger } from '@crewmeld/logger'
import WebSocket from 'ws'
import type { DiscordPluginConfig } from './types'

const logger = createLogger('DiscordGateway')

/** Discord Gateway Opcodes */
const GatewayOp = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RESUME: 6,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
} as const

/** Discord Gateway Intents */
const GatewayIntents = {
  GUILDS: 1 << 0,
  GUILD_MESSAGES: 1 << 9,
  GUILD_MESSAGE_CONTENT: 1 << 15, // Requires enabling in Discord Developer Portal
  DIRECT_MESSAGES: 1 << 12,
  MESSAGE_CONTENT: 1 << 15,
} as const

/** Single Gateway connection state */
type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

interface GatewayConnection {
  connectionId: string
  config: DiscordPluginConfig
  ws: WebSocket | null
  state: ConnectionState
  heartbeatInterval: ReturnType<typeof setInterval> | null
  heartbeatAck: boolean
  sequence: number | null
  sessionId: string | null
  resumeGatewayUrl: string | null
  reconnectAttempts: number
  botUsername: string | null
  botUserId: string | null
}

/** Max reconnection attempts */
const MAX_RECONNECT_ATTEMPTS = 15
/** Base reconnection delay (ms) */
const RECONNECT_BASE_DELAY = 1000

class DiscordGatewayManager {
  private connections = new Map<string, GatewayConnection>()

  /**
   * Connect to Discord Gateway
   * If a connection with the same connectionId already exists, disconnect first then reconnect
   */
  async connect(connectionId: string, config: DiscordPluginConfig): Promise<void> {
    // Disconnect old connection first
    if (this.connections.has(connectionId)) {
      logger.info(`[${connectionId}] Disconnecting old connection, preparing to reconnect`)
      await this.disconnect(connectionId)
    }

    const conn: GatewayConnection = {
      connectionId,
      config,
      ws: null,
      state: 'connecting',
      heartbeatInterval: null,
      heartbeatAck: true,
      sequence: null,
      sessionId: null,
      resumeGatewayUrl: null,
      reconnectAttempts: 0,
      botUsername: null,
      botUserId: null,
    }
    this.connections.set(connectionId, conn)

    logger.info(`[${connectionId}] Connecting to Discord Gateway...`, {
      guildId: config.guildId ?? '(all)',
      channelId: config.discordChannelId ?? '(all)',
      proxy: process.env.HTTPS_PROXY ?? '(no proxy)',
    })

    await this.createWebSocket(conn)
  }

  /**
   * Disconnect a specific connection
   */
  async disconnect(connectionId: string): Promise<void> {
    const conn = this.connections.get(connectionId)
    if (!conn) return

    conn.state = 'disconnected'
    this.cleanupConnection(conn)
    this.connections.delete(connectionId)
    logger.info(`[${connectionId}] Gateway disconnected`)
  }

  /**
   * Disconnect all connections
   */
  async disconnectAll(): Promise<void> {
    for (const id of this.connections.keys()) {
      await this.disconnect(id)
    }
  }

  /**
   * Get connection status
   */
  getStatus(connectionId: string): { state: ConnectionState; botUsername: string | null } | null {
    const conn = this.connections.get(connectionId)
    if (!conn) return null
    return { state: conn.state, botUsername: conn.botUsername }
  }

  /**
   * Get all connection statuses
   */
  getAllStatuses(): Record<string, { state: ConnectionState; botUsername: string | null }> {
    const result: Record<string, { state: ConnectionState; botUsername: string | null }> = {}
    for (const [id, conn] of this.connections) {
      result[id] = { state: conn.state, botUsername: conn.botUsername }
    }
    return result
  }

  /**
   * Create WebSocket connection
   */
  private async createWebSocket(conn: GatewayConnection): Promise<void> {
    const gatewayUrl = conn.resumeGatewayUrl ?? 'wss://gateway.discord.gg/?v=10&encoding=json'

    try {
      let wsOptions: WebSocket.ClientOptions = {}

      // Configure proxy
      const proxy = process.env.HTTPS_PROXY
      if (proxy) {
        const { HttpsProxyAgent } = await import('https-proxy-agent')
        const agent = new HttpsProxyAgent(proxy)
        wsOptions = { agent }
        logger.info(`[${conn.connectionId}] Using proxy: ${proxy}`)
      }

      const ws = new WebSocket(gatewayUrl, wsOptions)
      conn.ws = ws

      ws.on('open', () => {
        logger.info(`[${conn.connectionId}] WebSocket connected to ${gatewayUrl}`)
      })

      ws.on('message', (data) => {
        this.handleMessage(conn, data.toString())
      })

      ws.on('close', (code, reason) => {
        logger.warn(`[${conn.connectionId}] WebSocket closed`, {
          code,
          reason: reason.toString(),
          state: conn.state,
        })
        this.cleanupHeartbeat(conn)

        if (conn.state !== 'disconnected') {
          this.scheduleReconnect(conn)
        }
      })

      ws.on('error', (error) => {
        logger.error(`[${conn.connectionId}] WebSocket error`, { error: error.message })
      })
    } catch (error) {
      logger.error(`[${conn.connectionId}] Failed to create WebSocket`, { error })
      this.scheduleReconnect(conn)
    }
  }

  /**
   * Handle Gateway message
   */
  private handleMessage(conn: GatewayConnection, raw: string): void {
    let payload: {
      op: number
      d: Record<string, unknown> | null
      s: number | null
      t: string | null
    }
    try {
      payload = JSON.parse(raw)
    } catch {
      logger.warn(`[${conn.connectionId}] Failed to parse Gateway message`)
      return
    }

    // Update sequence
    if (payload.s !== null) {
      conn.sequence = payload.s
    }

    switch (payload.op) {
      case GatewayOp.HELLO:
        this.handleHello(conn, payload.d as Record<string, unknown>)
        break

      case GatewayOp.HEARTBEAT_ACK:
        conn.heartbeatAck = true
        break

      case GatewayOp.HEARTBEAT:
        // Server requests immediate heartbeat
        this.sendHeartbeat(conn)
        break

      case GatewayOp.RECONNECT:
        logger.info(`[${conn.connectionId}] Received RECONNECT opcode, preparing to reconnect`)
        conn.ws?.close(4000)
        break

      case GatewayOp.INVALID_SESSION:
        logger.warn(
          `[${conn.connectionId}] Invalid session, ${payload.d ? 'recoverable, will retry RESUME' : 'non-recoverable, sending IDENTIFY'}`
        )
        if (!payload.d) {
          // Non-recoverable: clear session, re-IDENTIFY on current connection (no need to disconnect and reconnect)
          conn.sessionId = null
          conn.sequence = null
          conn.resumeGatewayUrl = null
          setTimeout(
            () => {
              if (conn.ws?.readyState === WebSocket.OPEN) {
                this.sendIdentify(conn)
              } else {
                conn.ws?.close(4000)
              }
            },
            1000 + Math.random() * 4000
          )
        } else {
          // Recoverable: disconnect and follow normal reconnection flow (will auto RESUME)
          setTimeout(
            () => {
              conn.ws?.close(4000)
            },
            1000 + Math.random() * 4000
          )
        }
        break

      case GatewayOp.DISPATCH:
        this.handleDispatch(conn, payload.t!, payload.d!)
        break
    }
  }

  /**
   * Handle HELLO - start heartbeat + send IDENTIFY/RESUME
   */
  private handleHello(conn: GatewayConnection, data: Record<string, unknown>): void {
    const heartbeatIntervalMs = data.heartbeat_interval as number
    logger.info(
      `[${conn.connectionId}] Received HELLO, heartbeat interval: ${heartbeatIntervalMs}ms`
    )

    // Start heartbeat
    this.cleanupHeartbeat(conn)
    conn.heartbeatAck = true

    // Add jitter to first heartbeat
    const jitter = Math.random()
    setTimeout(() => {
      this.sendHeartbeat(conn)
      conn.heartbeatInterval = setInterval(() => {
        if (!conn.heartbeatAck) {
          // logger.warn(`[${conn.connectionId}] Heartbeat timeout, closing connection`)
          conn.ws?.close(4000)
          return
        }
        conn.heartbeatAck = false
        this.sendHeartbeat(conn)
      }, heartbeatIntervalMs)
    }, heartbeatIntervalMs * jitter)

    // Send IDENTIFY or RESUME
    if (conn.sessionId && conn.sequence !== null) {
      this.sendResume(conn)
    } else {
      this.sendIdentify(conn)
    }
  }

  /**
   * Send IDENTIFY
   */
  private sendIdentify(conn: GatewayConnection): void {
    const intents =
      GatewayIntents.GUILDS |
      GatewayIntents.GUILD_MESSAGES |
      GatewayIntents.GUILD_MESSAGE_CONTENT |
      GatewayIntents.DIRECT_MESSAGES

    const payload = {
      op: GatewayOp.IDENTIFY,
      d: {
        token: conn.config.botToken,
        intents,
        properties: {
          os: 'linux',
          browser: 'crewmeld',
          device: 'crewmeld',
        },
      },
    }

    conn.ws?.send(JSON.stringify(payload))
    logger.info(`[${conn.connectionId}] Sent IDENTIFY`)
  }

  /**
   * Send RESUME
   */
  private sendResume(conn: GatewayConnection): void {
    const payload = {
      op: GatewayOp.RESUME,
      d: {
        token: conn.config.botToken,
        session_id: conn.sessionId,
        seq: conn.sequence,
      },
    }

    conn.ws?.send(JSON.stringify(payload))
    logger.info(`[${conn.connectionId}] Sent RESUME`, { sessionId: conn.sessionId })
  }

  /**
   * Send heartbeat
   */
  private sendHeartbeat(conn: GatewayConnection): void {
    if (conn.ws?.readyState !== WebSocket.OPEN) return
    conn.ws.send(JSON.stringify({ op: GatewayOp.HEARTBEAT, d: conn.sequence }))
  }

  /**
   * Handle DISPATCH events
   */
  private handleDispatch(
    conn: GatewayConnection,
    eventName: string,
    data: Record<string, unknown>
  ): void {
    switch (eventName) {
      case 'READY': {
        const user = data.user as Record<string, unknown>
        conn.sessionId = data.session_id as string
        conn.resumeGatewayUrl = data.resume_gateway_url as string
        conn.state = 'connected'
        conn.reconnectAttempts = 0
        conn.botUsername = `${user.username}#${user.discriminator}`
        conn.botUserId = user.id as string

        logger.info(`[${conn.connectionId}] Gateway connected successfully!`, {
          botUser: conn.botUsername,
          botUserId: conn.botUserId,
          sessionId: conn.sessionId,
          guilds: (data.guilds as Array<unknown>)?.length ?? 0,
        })
        break
      }

      case 'RESUMED':
        conn.state = 'connected'
        conn.reconnectAttempts = 0
        logger.info(`[${conn.connectionId}] Gateway session resumed`)
        break

      case 'MESSAGE_CREATE':
        this.handleIncomingMessage(conn, data)
        break

      case 'INTERACTION_CREATE':
        this.handleInteraction(conn, data)
        break
    }
  }

  /**
   * Handle incoming Discord message - forward to standard webhook pipeline
   */
  private async handleIncomingMessage(
    conn: GatewayConnection,
    data: Record<string, unknown>
  ): Promise<void> {
    const author = data.author as Record<string, unknown> | undefined
    if (!author || author.bot) return

    const channelId = data.channel_id as string
    const guildId = data.guild_id as string | undefined

    // Filter conditions
    if (conn.config.guildId && guildId !== conn.config.guildId) return
    if (conn.config.discordChannelId && channelId !== conn.config.discordChannelId) return

    let content = (data.content as string)?.trim() ?? ''
    const attachments = data.attachments as Array<unknown> | undefined
    const hasAttachments = !!attachments && attachments.length > 0
    if (!content && !hasAttachments) return

    // Group chat (has guildId): only respond to @Bot messages (exact match on Bot user ID)
    // DM (no guildId): respond to all messages directly
    if (guildId && conn.botUserId) {
      const mentions = data.mentions as Array<Record<string, unknown>> | undefined
      const isMentioned = mentions?.some((m) => m.id === conn.botUserId) ?? false
      if (!isMentioned) return

      // Remove @Bot mention text
      content = content.replace(new RegExp(`<@!?${conn.botUserId}>`, 'g'), '').trim()

      // In group chat: only ignore when there is neither text nor attachments
      if (!content && !hasAttachments) return
    }

    logger.info(`[${conn.connectionId}] Received message`, {
      author: `${author.username}#${author.discriminator}`,
      channelId,
      contentLen: content.length,
      attachmentsCount: attachments?.length ?? 0,
      isDM: !guildId,
    })

    try {
      const { discordPlugin } = await import('./index')
      const { handleChannelWebhook } = await import('../../webhook-handler')

      const employeeId = conn.config.boundEmployeeId
      if (!employeeId) {
        logger.warn(`[${conn.connectionId}] Channel not bound to employee, message ignored`)
        return
      }

      // Write processed content back to data for parseMessage to use
      const processedData = { ...data, content }

      const fakeRequest = new Request('http://localhost/api/channels/discord/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(processedData),
      })

      await handleChannelWebhook(fakeRequest, {
        plugin: discordPlugin,
        config: conn.config,
        employeeId,
        workspaceId: conn.config.workspaceId ?? 'default',
      })
    } catch (error) {
      logger.error(`[${conn.connectionId}] Message processing failed`, { error })
    }
  }

  /**
   * Handle Interaction events (button clicks, etc.)
   *
   * Discord Interactions must be responded to within 3 seconds, or "This interaction failed" is shown.
   * Respond via REST API while forwarding the approval callback to the webhook pipeline.
   */
  private async handleInteraction(
    conn: GatewayConnection,
    data: Record<string, unknown>
  ): Promise<void> {
    const interactionType = data.type as number
    // type=3 is Message Component (button click)
    if (interactionType !== 3) return

    const interactionData = data.data as Record<string, unknown> | undefined
    const customId = interactionData?.custom_id as string | undefined
    if (!customId?.startsWith('approval:')) return

    const interactionId = data.id as string
    const interactionToken = data.token as string
    const member = data.member as Record<string, unknown> | undefined
    const user = (member?.user ?? data.user) as Record<string, unknown> | undefined
    const userId = user?.id as string
    const username = (user?.username as string) ?? 'unknown user'
    const message = data.message as Record<string, unknown> | undefined
    const messageId = message?.id as string | undefined
    const channelId = data.channel_id as string

    logger.info(`[${conn.connectionId}] Received approval button click`, {
      customId,
      userId,
      username,
      channelId,
    })

    // 1. Immediately respond to Interaction (deferred update mode) to avoid 3-second timeout
    try {
      const { discordFetch } = await import('./fetch')
      // type=6 means Deferred Update Message (tells Discord to update later)
      await discordFetch(
        `/interactions/${interactionId}/${interactionToken}/callback`,
        conn.config.botToken,
        { method: 'POST', body: JSON.stringify({ type: 6 }) }
      )
    } catch (err) {
      logger.error(`[${conn.connectionId}] Interaction response failed`, { error: err })
    }

    // 2. Forward approval callback to webhook pipeline for processing
    try {
      const { discordPlugin } = await import('./index')
      const { handleChannelWebhook } = await import('../../webhook-handler')

      const employeeId = conn.config.boundEmployeeId
      if (!employeeId) {
        logger.warn(
          `[${conn.connectionId}] Channel not bound to employee, approval callback ignored`
        )
        return
      }

      // Construct a request body that parseCardAction can recognize
      const interactionBody = {
        __discordInteraction: true,
        custom_id: customId,
        user_id: userId,
        message_id: messageId ? `${channelId}:${messageId}` : undefined,
        channel_id: channelId,
      }

      const fakeRequest = new Request('http://localhost/api/channels/discord/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(interactionBody),
      })

      await handleChannelWebhook(fakeRequest, {
        plugin: discordPlugin,
        config: conn.config,
        employeeId,
        workspaceId: conn.config.workspaceId ?? 'default',
      })

      logger.info(`[${conn.connectionId}] Approval callback processed`, { customId, userId })
    } catch (error) {
      logger.error(`[${conn.connectionId}] Approval callback processing failed`, { error })
    }
  }

  /**
   * Schedule reconnection
   */
  private scheduleReconnect(conn: GatewayConnection): void {
    if (conn.state === 'disconnected') return

    conn.reconnectAttempts++
    if (conn.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      logger.error(
        `[${conn.connectionId}] Max reconnect attempts reached (${MAX_RECONNECT_ATTEMPTS}), will reset and retry in 60s`
      )
      // Don't delete the connection; instead wait and then reset the counter to retry
      conn.state = 'reconnecting'
      conn.sessionId = null
      conn.sequence = null
      conn.resumeGatewayUrl = null
      setTimeout(() => {
        if (conn.state === 'disconnected') return
        conn.reconnectAttempts = 0
        logger.info(`[${conn.connectionId}] Reconnect counter reset, starting new reconnect cycle`)
        this.createWebSocket(conn)
      }, 60000)
      return
    }

    // Exponential backoff + jitter
    const delay = Math.min(
      RECONNECT_BASE_DELAY * 2 ** (conn.reconnectAttempts - 1) + Math.random() * 1000,
      30000
    )

    conn.state = 'reconnecting'
    logger.info(
      `[${conn.connectionId}] Reconnecting in ${delay.toFixed(0)}ms (attempt ${conn.reconnectAttempts})`
    )

    setTimeout(() => {
      if (conn.state === 'disconnected') return
      this.createWebSocket(conn)
    }, delay)
  }

  /**
   * Clean up heartbeat timer
   */
  private cleanupHeartbeat(conn: GatewayConnection): void {
    if (conn.heartbeatInterval) {
      clearInterval(conn.heartbeatInterval)
      conn.heartbeatInterval = null
    }
  }

  /**
   * Clean up connection resources
   */
  private cleanupConnection(conn: GatewayConnection): void {
    this.cleanupHeartbeat(conn)
    if (conn.ws) {
      conn.ws.removeAllListeners()
      if (conn.ws.readyState === WebSocket.OPEN || conn.ws.readyState === WebSocket.CONNECTING) {
        conn.ws.close(1000)
      }
      conn.ws = null
    }
  }
}

/** Global singleton (uses globalThis to prevent multiple instances caused by Next.js HMR rebuilds) */
const globalForDiscord = globalThis as typeof globalThis & {
  __discordGateway?: DiscordGatewayManager
}
export const discordGateway = globalForDiscord.__discordGateway ?? new DiscordGatewayManager()
globalForDiscord.__discordGateway = discordGateway

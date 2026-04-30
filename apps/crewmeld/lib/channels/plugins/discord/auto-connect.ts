/**
 * Discord Gateway auto-connect helper functions
 *
 * Called by channel CRUD API; auto-connects Gateway when creating/updating Discord channels,
 * auto-disconnects when deleting.
 */

import { createLogger } from '@crewmeld/logger'
import type { ConnectionConfig } from '@/lib/connectors/types'
import type { DiscordPluginConfig } from './types'

const logger = createLogger('DiscordAutoConnect')

/**
 * Try to connect Discord Gateway (called when creating/updating channel)
 */
export async function tryConnectDiscordGateway(
  connectionId: string,
  config: ConnectionConfig
): Promise<void> {
  const botToken = config.botToken
  if (!botToken) {
    logger.warn(`[${connectionId}] Discord channel missing botToken, skipping Gateway connection`)
    return
  }

  const pluginConfig: DiscordPluginConfig = {
    botToken,
    guildId: config.guildId,
    discordChannelId: config.discordChannelId,
    boundEmployeeId: config.boundEmployeeId,
  }

  const { discordGateway } = await import('./gateway')
  await discordGateway.connect(connectionId, pluginConfig)
}

/**
 * Try to disconnect Discord Gateway (called when deleting channel)
 */
export async function tryDisconnectDiscordGateway(connectionId: string): Promise<void> {
  const { discordGateway } = await import('./gateway')
  await discordGateway.disconnect(connectionId)
}

/**
 * Restore all Discord channel Gateway connections on startup
 *
 * Reads all discord-type connections from database and establishes Gateways one by one.
 * Can be called at application startup.
 */
export async function restoreAllDiscordGateways(): Promise<void> {
  try {
    const { resolveAllCredentialsByType } = await import('@/lib/connectors/resolver')
    const credentials = await resolveAllCredentialsByType('discord')

    if (credentials.length === 0) {
      logger.info('No Discord channels found, skipping Gateway restore')
      return
    }

    logger.info(`Restoring ${credentials.length} Discord Gateway connections...`)

    const tasks = credentials
      .filter((cred) => {
        if (!cred.config.botToken) return false
        if (!cred.config.boundEmployeeId) {
          logger.warn(`Discord channel ${cred.connectionId} not bound to employee, skipping`)
          return false
        }
        return true
      })
      .map((cred) =>
        tryConnectDiscordGateway(cred.connectionId, cred.config).catch((error) => {
          logger.error(`Failed to restore Discord Gateway: ${cred.connectionId}`, { error })
        })
      )

    await Promise.allSettled(tasks)
  } catch (error) {
    logger.error('Failed to restore Discord Gateway connections', { error })
  }
}

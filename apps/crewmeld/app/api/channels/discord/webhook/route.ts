/**
 * POST /api/channels/discord/webhook — Discord message callback (for external Gateway forwarding)
 *
 * Normally Discord messages are handled directly by the built-in Gateway; this route serves as a backup entry.
 * External Gateways or test tools can POST Discord MESSAGE_CREATE events to this route.
 */

import { createLogger } from '@crewmeld/logger'
import type { NextRequest } from 'next/server'
import { apiErr } from '@/lib/api/response'
import { discordPlugin } from '@/lib/channels/plugins/discord'
import type { DiscordPluginConfig } from '@/lib/channels/plugins/discord/types'
import { handleChannelWebhook } from '@/lib/channels/webhook-handler'
import { resolveAllCredentialsByType } from '@/lib/connectors/resolver'

const logger = createLogger('DiscordWebhook')

function buildConfig(c: Record<string, unknown>): DiscordPluginConfig {
  return {
    botToken: (c.botToken as string) ?? '',
    guildId: c.guildId as string | undefined,
    discordChannelId: c.discordChannelId as string | undefined,
    boundEmployeeId: c.boundEmployeeId as string | undefined,
  }
}

export async function POST(request: NextRequest) {
  const bodyText = await request.text()

  let guildId: string | undefined
  try {
    const body = JSON.parse(bodyText)
    guildId = body.guild_id as string | undefined
  } catch {
    /* ignore */
  }

  logger.info('Discord webhook request received', { guildId, bodyLen: bodyText.length })

  const credentials = await resolveAllCredentialsByType('discord')
  if (credentials.length === 0) {
    logger.warn('Discord webhook: no available configuration')
    return apiErr('api.channelWebhook.discordNotConfigured', { status: 500 })
  }

  // Match by guildId
  let matched = credentials[0]
  if (guildId) {
    const found = credentials.find((cred) => cred.config.guildId === guildId)
    if (found) matched = found
  }

  const config = buildConfig(matched.config as unknown as Record<string, unknown>)
  const employeeId = config.boundEmployeeId

  if (!employeeId) {
    logger.warn('Discord webhook: connection has no bound employee')
    return apiErr('api.channelWebhook.discordNotBound', { status: 500 })
  }

  const newRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: bodyText,
  })

  return handleChannelWebhook(newRequest, {
    plugin: discordPlugin,
    config,
    employeeId,
  })
}

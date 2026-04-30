/**
 * POST /api/channels/telegram/webhook — Telegram Bot event callback
 *
 * Uses unified webhook processing pipeline + Telegram plugin.
 * Credentials are read from DB systemConnections; employeeId comes from config.boundEmployeeId.
 */

import { createLogger } from '@crewmeld/logger'
import type { NextRequest } from 'next/server'
import { telegramPlugin } from '@/lib/channels/plugins/telegram'
import type { TelegramPluginConfig } from '@/lib/channels/plugins/telegram/types'
import { handleChannelWebhook, parseRequestBody } from '@/lib/channels/webhook-handler'
import { resolveAllCredentialsByType } from '@/lib/connectors/resolver'

const logger = createLogger('TelegramWebhook')

/**
 * Match Telegram connection credentials in DB based on request
 *
 * Compatible with legacy webhook URLs (without connectionId).
 * Newly created channels use /api/channels/telegram/webhook/c/[connectionId] route.
 * This still uses the first available credential as fallback.
 */
async function resolveTelegramConfig(): Promise<TelegramPluginConfig | null> {
  const credentials = await resolveAllCredentialsByType('telegram')

  if (credentials.length > 1) {
    logger.warn(
      'Generic Telegram webhook matched multiple credentials, using first. Migrate to /c/[connectionId]',
      {
        count: credentials.length,
        names: credentials.map((c) => c.connectionName).join(', '),
      }
    )
  }

  if (credentials.length > 0) {
    return credentials[0].config as unknown as TelegramPluginConfig
  }

  return null
}

export async function POST(request: NextRequest) {
  logger.info('========== Telegram webhook request received ==========')

  const parsed = await parseRequestBody(request.clone())

  if (!parsed) {
    logger.warn('Telegram webhook: failed to parse JSON')
    return Response.json({ ok: true })
  }

  const config = await resolveTelegramConfig()

  if (!config) {
    logger.warn('Telegram webhook: no matching credential')
    return Response.json({ ok: true })
  }

  // Verify secret token
  if (config.telegramWebhookSecret) {
    const secretHeader = request.headers.get('x-telegram-bot-api-secret-token')
    if (secretHeader !== config.telegramWebhookSecret) {
      logger.warn('Telegram webhook: Secret Token verification failed')
      return Response.json({ ok: true })
    }
  }

  const employeeId = config.boundEmployeeId ?? ''
  logger.info('Telegram webhook credential matched', { employeeId, hasEmployeeId: !!employeeId })

  return handleChannelWebhook(request, {
    plugin: telegramPlugin,
    config,
    employeeId,
  })
}

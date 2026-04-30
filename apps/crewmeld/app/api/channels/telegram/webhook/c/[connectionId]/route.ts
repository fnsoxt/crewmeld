/**
 * POST /api/channels/telegram/webhook/c/[connectionId] — Telegram Bot event callback (exact routing by connection ID)
 *
 * Each Telegram channel connection has its own webhook URL, matching credentials precisely via connectionId,
 * preventing cross-talk between multiple bots.
 */

import { createLogger } from '@crewmeld/logger'
import type { NextRequest } from 'next/server'
import { apiErr } from '@/lib/api/response'
import { telegramPlugin } from '@/lib/channels/plugins/telegram'
import type { TelegramPluginConfig } from '@/lib/channels/plugins/telegram/types'
import { handleChannelWebhook, parseRequestBody } from '@/lib/channels/webhook-handler'
import { resolveCredentialById } from '@/lib/connectors/resolver'

const logger = createLogger('TelegramWebhook:Connection')

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params

  if (!connectionId) {
    return apiErr('api.channelWebhook.missingConnectionId', { status: 400 })
  }

  logger.info('Telegram connection webhook request received', { connectionId })

  const parsed = await parseRequestBody(request.clone())
  if (!parsed) {
    logger.warn('Telegram webhook: JSON parse failed', { connectionId })
    return Response.json({ ok: true })
  }

  const credential = await resolveCredentialById(connectionId)
  if (!credential) {
    logger.warn('Telegram webhook: no matching credentials', { connectionId })
    return Response.json({ ok: true })
  }

  if (credential.type !== 'telegram') {
    logger.warn('Telegram webhook: connection type mismatch', {
      connectionId,
      type: credential.type,
    })
    return Response.json({ ok: true })
  }

  const rawConfig = credential.config as Record<string, unknown>
  const config: TelegramPluginConfig = {
    telegramBotToken: (rawConfig.telegramBotToken as string) ?? '',
    telegramWebhookSecret: (rawConfig.telegramWebhookSecret as string) ?? undefined,
    boundEmployeeId: (rawConfig.boundEmployeeId as string) ?? undefined,
  }

  // Verify secret token
  if (config.telegramWebhookSecret) {
    const secretHeader = request.headers.get('x-telegram-bot-api-secret-token')
    if (secretHeader !== config.telegramWebhookSecret) {
      logger.warn('Telegram webhook: Secret Token verification failed', { connectionId })
      return Response.json({ ok: true })
    }
  }

  const employeeId = config.boundEmployeeId ?? ''
  if (!employeeId) {
    logger.warn('Telegram webhook: connection has no bound digital employee', { connectionId })
    return Response.json({ ok: true })
  }

  logger.info('Telegram connection webhook matched successfully', { connectionId, employeeId })

  return handleChannelWebhook(request, {
    plugin: telegramPlugin,
    config,
    employeeId,
  })
}

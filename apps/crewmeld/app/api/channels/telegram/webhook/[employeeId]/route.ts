/**
 * POST /api/channels/telegram/webhook/[employeeId] — Telegram Bot event callback (multi-employee routing)
 *
 * Each digital employee has its own webhook URL, supporting multi-bot multi-employee scenarios.
 */

import { createLogger } from '@crewmeld/logger'
import type { NextRequest } from 'next/server'
import { apiErr } from '@/lib/api/response'
import { telegramPlugin } from '@/lib/channels/plugins/telegram'
import type { TelegramPluginConfig } from '@/lib/channels/plugins/telegram/types'
import { handleChannelWebhook, parseRequestBody } from '@/lib/channels/webhook-handler'
import {
  resolveAllCredentialsByType,
  resolveCredentialByBoundEmployee,
} from '@/lib/connectors/resolver'

const logger = createLogger('TelegramWebhook:Employee')

async function resolveTelegramConfig(employeeId: string): Promise<TelegramPluginConfig | null> {
  const bound = await resolveCredentialByBoundEmployee(employeeId, 'telegram')
  if (bound) {
    const c = bound.config
    return {
      telegramBotToken: (c.telegramBotToken as string) ?? '',
      telegramWebhookSecret: (c.telegramWebhookSecret as string) ?? undefined,
      boundEmployeeId: employeeId,
    }
  }

  const credentials = await resolveAllCredentialsByType('telegram')
  if (credentials.length > 0) {
    const c = credentials[0].config
    return {
      telegramBotToken: (c.telegramBotToken as string) ?? '',
      telegramWebhookSecret: (c.telegramWebhookSecret as string) ?? undefined,
      boundEmployeeId: employeeId,
    }
  }

  return null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const { employeeId } = await params

  if (!employeeId) {
    return apiErr('api.channelWebhook.missingEmployeeId', { status: 400 })
  }

  logger.info('Telegram employee webhook request received', { employeeId })

  const parsed = await parseRequestBody(request.clone())
  if (!parsed) {
    logger.warn('Telegram webhook: JSON parse failed', { employeeId })
    return Response.json({ ok: true })
  }

  const config = await resolveTelegramConfig(employeeId)
  if (!config) {
    logger.warn('Telegram webhook: no matching credentials', { employeeId })
    return Response.json({ ok: true })
  }

  // Verify secret token
  if (config.telegramWebhookSecret) {
    const secretHeader = request.headers.get('x-telegram-bot-api-secret-token')
    if (secretHeader !== config.telegramWebhookSecret) {
      logger.warn('Telegram webhook: Secret Token verification failed', { employeeId })
      return Response.json({ ok: true })
    }
  }

  return handleChannelWebhook(request, {
    plugin: telegramPlugin,
    config,
    employeeId,
  })
}

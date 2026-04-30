/**
 * POST /api/channels/feishu/webhook/[employeeId] — Feishu event callback (multi-employee routing)
 *
 * Each digital employee has its own webhook URL.
 * employeeId comes from the URL path parameter (not config.boundEmployeeId).
 */

import { createLogger } from '@crewmeld/logger'
import type { NextRequest } from 'next/server'
import { apiErr } from '@/lib/api/response'
import { feishuPlugin } from '@/lib/channels/plugins/feishu'
import type { FeishuPluginConfig } from '@/lib/channels/plugins/feishu/types'
import { handleChannelWebhook, parseRequestBody } from '@/lib/channels/webhook-handler'
import { resolveAllCredentialsByType } from '@/lib/connectors/resolver'

const logger = createLogger('FeishuWebhook:Employee')

async function resolveFeishuConfig(appId?: string): Promise<FeishuPluginConfig | null> {
  const credentials = await resolveAllCredentialsByType('feishu')

  if (appId) {
    for (const cred of credentials) {
      if (cred.config.appId === appId) {
        return cred.config as unknown as FeishuPluginConfig
      }
    }
  }

  if (credentials.length > 0) {
    return credentials[0].config as unknown as FeishuPluginConfig
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

  const clonedRequest = request.clone()
  const parsed = await parseRequestBody(clonedRequest)

  if (!parsed) {
    logger.warn('Feishu webhook: JSON parse failed', { employeeId })
    return Response.json({})
  }

  let { body } = parsed

  if (body.type === 'url_verification') {
    return Response.json({ challenge: body.challenge })
  }

  if (body.encrypt && typeof body.encrypt === 'string') {
    const cred = await resolveFeishuConfig()
    if (!cred?.encodingAESKey) {
      logger.warn('Feishu encrypted message but encryptKey not configured', { employeeId })
      return Response.json({})
    }
    const decrypted = feishuPlugin.inbound.decryptPayload?.(body, cred)
    if (decrypted) {
      body = decrypted
      if (body.type === 'url_verification') {
        return Response.json({ challenge: body.challenge })
      }
    }
  }

  const header = body.header as Record<string, unknown> | undefined
  const eventAppId = header?.app_id as string | undefined
  const config = await resolveFeishuConfig(eventAppId)

  if (!config) {
    logger.warn('Feishu webhook: no matching credentials', { appId: eventAppId, employeeId })
    return Response.json({})
  }

  return handleChannelWebhook(request, {
    plugin: feishuPlugin,
    config,
    employeeId,
  })
}

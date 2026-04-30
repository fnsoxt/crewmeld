/**
 * POST /api/channels/feishu/webhook — Feishu (Lark) event callback
 *
 * Uses unified webhook processing pipeline + Feishu plugin.
 * Credentials are read from DB systemConnections; employeeId comes from config.boundEmployeeId.
 */

import { createLogger } from '@crewmeld/logger'
import type { NextRequest } from 'next/server'
import { feishuPlugin } from '@/lib/channels/plugins/feishu'
import type { FeishuPluginConfig } from '@/lib/channels/plugins/feishu/types'
import { handleChannelWebhook, parseRequestBody } from '@/lib/channels/webhook-handler'
import { resolveAllCredentialsByType } from '@/lib/connectors/resolver'

const logger = createLogger('FeishuWebhook')

/**
 * Match Feishu connection credentials in DB by appId and convert to FeishuPluginConfig
 */
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

export async function POST(request: NextRequest) {
  logger.info('========== Feishu webhook request received ==========')

  // Pre-parse body to extract appId (Feishu-specific: credentials depend on app_id in the message)
  const clonedRequest = request.clone()
  const parsed = await parseRequestBody(clonedRequest)

  if (!parsed) {
    logger.warn('Feishu webhook: failed to parse JSON')
    return Response.json({})
  }

  let { body } = parsed
  logger.info('Feishu webhook body', {
    type: body.type,
    hasEncrypt: !!body.encrypt,
    keys: Object.keys(body),
  })

  // Handle URL verification early (no credentials needed)
  if (body.type === 'url_verification') {
    return Response.json({ challenge: body.challenge })
  }

  // Pre-decrypt encrypted messages (must decrypt before extracting appId)
  if (body.encrypt && typeof body.encrypt === 'string') {
    const cred = await resolveFeishuConfig()
    if (!cred?.encodingAESKey) {
      logger.warn('Feishu encrypted message but encryptKey not configured')
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

  // Extract appId to match credentials
  const header = body.header as Record<string, unknown> | undefined
  const eventAppId = header?.app_id as string | undefined
  const config = await resolveFeishuConfig(eventAppId)

  if (!config) {
    logger.warn('Feishu webhook: no matching credential', { appId: eventAppId })
    return Response.json({})
  }

  const employeeId = config.boundEmployeeId ?? ''
  logger.info('Feishu webhook credential matched', {
    appId: eventAppId,
    employeeId,
    hasEmployeeId: !!employeeId,
  })

  return handleChannelWebhook(request, {
    plugin: feishuPlugin,
    config,
    employeeId,
  })
}

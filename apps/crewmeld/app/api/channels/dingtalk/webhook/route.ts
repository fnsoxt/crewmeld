/**
 * POST /api/channels/dingtalk/webhook — DingTalk event callback (generic route)
 *
 * Matches connection credentials by robotCode in the request body.
 */

import { createLogger } from '@crewmeld/logger'
import type { NextRequest } from 'next/server'
import { apiErr } from '@/lib/api/response'
import { dingtalkPlugin } from '@/lib/channels/plugins/dingtalk'
import type { DingtalkPluginConfig } from '@/lib/channels/plugins/dingtalk/types'
import { handleChannelWebhook } from '@/lib/channels/webhook-handler'
import { resolveAllCredentialsByType } from '@/lib/connectors/resolver'

const logger = createLogger('DingtalkWebhook')

function buildConfig(c: Record<string, unknown>): DingtalkPluginConfig {
  return {
    appKey: (c.appKey as string) ?? '',
    appSecret: (c.appSecret as string) ?? '',
    robotCode: c.robotCode as string | undefined,
    secret: c.secret as string | undefined,
    aesKey: c.aesKey as string | undefined,
    token: c.token as string | undefined,
    suiteKey: (c.suiteKey as string) ?? (c.appKey as string),
    boundEmployeeId: c.boundEmployeeId as string | undefined,
  }
}

export async function POST(request: NextRequest) {
  // Read body text, extract robotCode, then rebuild Request for handler
  const bodyText = await request.text()

  let robotCode: string | undefined
  try {
    const body = JSON.parse(bodyText)
    robotCode = body.robotCode as string | undefined
  } catch {
    /* ignore */
  }

  logger.info('DingTalk webhook request received', { robotCode, bodyLen: bodyText.length })

  // Read all DingTalk connections from DB
  const credentials = await resolveAllCredentialsByType('dingtalk')
  if (credentials.length === 0) {
    logger.warn('DingTalk webhook: no available configuration')
    return apiErr('api.channelWebhook.dingtalkNotConfigured', { status: 500 })
  }

  // Match by robotCode (robotCode = appKey)
  let matched = credentials[0]
  if (robotCode) {
    const found = credentials.find(
      (cred) => cred.config.appKey === robotCode || cred.config.robotCode === robotCode
    )
    if (found) matched = found
  }

  const config = buildConfig(matched.config as unknown as Record<string, unknown>)
  const employeeId = config.boundEmployeeId

  if (!employeeId) {
    logger.warn('DingTalk webhook: connection has no bound employee', {
      appKey: config.appKey?.slice(0, 6),
    })
    return apiErr('api.channelWebhook.dingtalkNotBound', { status: 500 })
  }

  // Rebuild Request with the read bodyText to avoid body-already-consumed issue
  const newRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: bodyText,
  })

  return handleChannelWebhook(newRequest, {
    plugin: dingtalkPlugin,
    config,
    employeeId,
  })
}

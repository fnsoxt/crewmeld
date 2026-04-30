/**
 * GET/POST /api/channels/wxoa/webhook/[employeeId] — Official Account event callback (multi-employee routing)
 *
 * Each digital employee has its own webhook URL.
 */

import { createLogger } from '@crewmeld/logger'
import type { NextRequest } from 'next/server'
import { apiErr } from '@/lib/api/response'
import { wxoaPlugin } from '@/lib/channels/plugins/wxoa'
import type { WxoaPluginConfig } from '@/lib/channels/plugins/wxoa/types'
import { handleWeComWebhook } from '@/lib/channels/webhook-handler'
import { generateWxoaSignature } from '@/lib/channels/wxoa-crypto'
import {
  resolveAllCredentialsByType,
  resolveCredentialByBoundEmployee,
} from '@/lib/connectors/resolver'

const logger = createLogger('WxoaWebhook:Employee')

async function resolveWxoaConfig(employeeId: string): Promise<WxoaPluginConfig | null> {
  const bound = await resolveCredentialByBoundEmployee(employeeId, 'wxoa')
  if (bound) {
    const c = bound.config
    return {
      appId: (c.appId as string) ?? '',
      appSecret: (c.appSecret as string) ?? '',
      token: (c.token as string) ?? '',
      encodingAESKey: (c.encodingAESKey as string) ?? undefined,
      accountType: (c.accountType as 'service' | 'subscription' | undefined) ?? 'service',
      boundEmployeeId: employeeId,
    }
  }

  const credentials = await resolveAllCredentialsByType('wxoa')
  if (credentials.length > 0) {
    const c = credentials[0].config
    return {
      appId: (c.appId as string) ?? '',
      appSecret: (c.appSecret as string) ?? '',
      token: (c.token as string) ?? '',
      encodingAESKey: (c.encodingAESKey as string) ?? undefined,
      accountType: (c.accountType as 'service' | 'subscription' | undefined) ?? 'service',
      boundEmployeeId: employeeId,
    }
  }

  return null
}

/**
 * GET — Official Account URL verification
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const { employeeId } = await params
  const url = new URL(request.url)
  const signature = url.searchParams.get('signature') ?? ''
  const timestamp = url.searchParams.get('timestamp') ?? ''
  const nonce = url.searchParams.get('nonce') ?? ''
  const echostr = url.searchParams.get('echostr') ?? ''

  const config = await resolveWxoaConfig(employeeId)
  if (!config) {
    return apiErr('api.channelWebhook.wxoaNotConfigured', { status: 500 })
  }

  const expected = generateWxoaSignature(config.token, timestamp, nonce)
  if (expected !== signature) {
    logger.warn('WxOA URL verification signature mismatch', { employeeId })
    return apiErr('api.channelWebhook.signatureInvalid', { status: 403 })
  }

  // Official Account URL verification: return echostr as-is (plaintext, no decryption needed)
  return new Response(echostr, { status: 200, headers: { 'Content-Type': 'text/plain' } })
}

/**
 * POST — Official Account message callback
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const { employeeId } = await params

  if (!employeeId) {
    return apiErr('api.channelWebhook.missingEmployeeId', { status: 400 })
  }

  const config = await resolveWxoaConfig(employeeId)
  if (!config) {
    logger.warn('WxOA webhook: no matching credentials', { employeeId })
    return new Response('success', { status: 200 })
  }

  return handleWeComWebhook(request, {
    plugin: wxoaPlugin,
    config,
    employeeId,
  })
}

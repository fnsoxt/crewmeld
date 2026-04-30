/**
 * GET/POST /api/channels/wxoa/webhook — WeChat Official Account event callback
 *
 * GET:  URL verification (sent by WeChat server on initial setup)
 * POST: Message reception (user messages, follow/unfollow events, etc.)
 *
 * Uses unified webhook processing pipeline + Official Account plugin.
 */

import { createLogger } from '@crewmeld/logger'
import type { NextRequest } from 'next/server'
import { apiErr } from '@/lib/api/response'
import { wxoaPlugin } from '@/lib/channels/plugins/wxoa'
import type { WxoaPluginConfig } from '@/lib/channels/plugins/wxoa/types'
import { handleWeComWebhook } from '@/lib/channels/webhook-handler'
import { extractXmlTag } from '@/lib/channels/wecom-adapter'
import { generateWxoaEncryptSignature, generateWxoaSignature } from '@/lib/channels/wxoa-crypto'
import {
  resolveAllCredentialsByType,
  resolveEmployeeByConnectionId,
} from '@/lib/connectors/resolver'

const logger = createLogger('WxoaWebhook')

/**
 * GET /api/channels/wxoa/webhook — URL verification
 *
 * WeChat server sends GET request for verification:
 * ?signature=xxx&timestamp=xxx&nonce=xxx&echostr=xxx
 * Returns echostr as-is upon successful verification
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const signature = url.searchParams.get('signature') ?? ''
    const timestamp = url.searchParams.get('timestamp') ?? ''
    const nonce = url.searchParams.get('nonce') ?? ''
    const echostr = url.searchParams.get('echostr') ?? ''

    logger.info('========== WxOA GET verification request ==========', {
      hasSignature: !!signature,
      timestamp,
      nonce,
      hasEchostr: !!echostr,
    })

    if (!signature || !echostr) {
      logger.warn('GET verification: missing signature or echostr')
      return new Response('ok', { status: 200 })
    }

    // Iterate over all Official Account credentials and match signatures one by one
    const credentials = await resolveAllCredentialsByType('wxoa')
    logger.info('GET verification: fetched credentials', { count: credentials.length })

    for (const cred of credentials) {
      const { token } = cred.config
      if (!token) continue

      const expected = generateWxoaSignature(token as string, timestamp, nonce)
      if (expected === signature) {
        logger.info('GET verification successful')
        return new Response(echostr, { status: 200, headers: { 'Content-Type': 'text/plain' } })
      }
    }

    logger.warn('URL verification failed: no matching credentials')
    return apiErr('api.channelWebhook.signatureInvalid', { status: 403 })
  } catch (error) {
    logger.error('GET verification error', error)
    return apiErr('api.channelWebhook.internalError', { status: 500 })
  }
}

/**
 * POST /api/channels/wxoa/webhook — Receive messages
 *
 * Key constraint: must return "success" within 5 seconds.
 * LLM inference is handled asynchronously; replies are sent via customer service message API.
 */
export async function POST(request: NextRequest) {
  const bodyText = await request.text()
  logger.info('========== WxOA POST request ==========', { bodyLen: bodyText.length })

  const toUserName = extractXmlTag(bodyText, 'ToUserName')

  const credentials = await resolveAllCredentialsByType('wxoa')
  let matchedConfig: WxoaPluginConfig | null = null
  let matchedConnectionId = ''

  const url = new URL(request.url)

  // Encrypted mode: check msg_signature
  const msgSignature = url.searchParams.get('msg_signature') ?? ''
  const timestamp = url.searchParams.get('timestamp') ?? ''
  const nonce = url.searchParams.get('nonce') ?? ''

  if (msgSignature) {
    // Encrypted mode: 4-parameter signature verification
    const encryptedContent = extractXmlTag(bodyText, 'Encrypt')
    for (const cred of credentials) {
      const { token, encodingAESKey } = cred.config
      if (!token || !encodingAESKey) continue

      const sig = generateWxoaEncryptSignature(token as string, timestamp, nonce, encryptedContent)
      if (sig === msgSignature) {
        matchedConfig = cred.config as unknown as WxoaPluginConfig
        matchedConnectionId = cred.connectionId
        break
      }
    }
  } else {
    // Plaintext mode: 3-parameter signature verification
    const signature = url.searchParams.get('signature') ?? ''
    for (const cred of credentials) {
      const { token } = cred.config
      if (!token) continue

      const sig = generateWxoaSignature(token as string, timestamp, nonce)
      if (sig === signature) {
        matchedConfig = cred.config as unknown as WxoaPluginConfig
        matchedConnectionId = cred.connectionId
        break
      }
    }
  }

  // Fallback: match ToUserName (Official Account original ID) by appId
  if (!matchedConfig) {
    for (const cred of credentials) {
      if (cred.config.appId === toUserName) {
        matchedConfig = cred.config as unknown as WxoaPluginConfig
        matchedConnectionId = cred.connectionId
        break
      }
    }
  }

  if (!matchedConfig && credentials.length > 0) {
    matchedConfig = credentials[0].config as unknown as WxoaPluginConfig
    matchedConnectionId = credentials[0].connectionId
  }

  if (!matchedConfig) {
    logger.warn('POST: no matching credentials', { toUserName })
    return new Response('success', { status: 200 })
  }

  // Look up the bound digital employee by connectionId
  const employeeId = matchedConnectionId
    ? ((await resolveEmployeeByConnectionId(matchedConnectionId)) ?? '')
    : ''

  logger.info('WxOA message routing', {
    connectionId: matchedConnectionId,
    employeeId: employeeId || '(unbound)',
  })

  // Rebuild Request (body already consumed)
  const newRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: bodyText,
  })

  // Reuse handleWeComWebhook (XML processing pipeline; Official Account also uses XML)
  return handleWeComWebhook(newRequest, {
    plugin: wxoaPlugin,
    config: matchedConfig,
    employeeId,
  })
}

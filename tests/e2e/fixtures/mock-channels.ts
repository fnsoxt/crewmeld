/**
 * Inbound webhook emitter for Playwright E2E tests.
 *
 * Unlike the other mock fixtures (mock-llm, mock-k8s, mock-ragflow) which
 * intercept OUTBOUND requests from the app via `page.route()`, this module
 * emits INBOUND webhook POSTs to our own server to simulate channel messages
 * arriving from external platforms (DingTalk, Feishu, WeCom, WxOA, Telegram,
 * Discord).
 *
 * Usage in a spec:
 *   import { postChannelMessage } from '../fixtures/mock-channels'
 *   // ...
 *   const res = await postChannelMessage(request, 'telegram', 'emp-123', 'Hello')
 *   expect(res.ok()).toBe(true)
 *
 * The helper uses Playwright's `APIRequestContext` (the `request` fixture) so
 * it does not require a `Page` and can be used in API-only tests or alongside
 * page-based tests.
 *
 * ## Signature handling
 *
 * - **dingtalk**: HMAC-SHA256 signature computed from `timestamp + '\n' + secret`
 *   where `secret` is the value passed in `MockChannelOptions.dingtalkSecret`.
 *   Defaults to a placeholder that will fail server-side signature verification
 *   unless `config.secret` in the DB matches. Pass the actual configured secret
 *   for integration tests against a live database.
 * - **feishu**: Signature header omitted by default — the plugin returns `true`
 *   when `X-Lark-Signature` is absent.
 * - **wecom**: XML body with `<ToUserName>` and `<Encrypt>` placeholder tags.
 *   Signature validation requires real AES-encrypted content that matches the
 *   DB credential; in E2E tests without a seeded WeCom credential the handler
 *   will return `200 success` from the fallback path.
 * - **wxoa**: Same as WeCom — XML body, no valid signature by default.
 * - **telegram**: No signature header sent (the plugin skips verification when
 *   `telegramWebhookSecret` is not configured in the credential).
 * - **discord**: No signature required (`verifySignature` always returns `true`).
 *
 * ## Route paths verified
 *
 * All channels use the per-employee route:
 *   POST /api/channels/{channel}/webhook/{employeeId}
 *
 * Verified against:
 *   app/api/channels/{channel}/webhook/[employeeId]/route.ts
 *
 * @module mock-channels
 */
import crypto from 'crypto'
import type { APIRequestContext, APIResponse } from '@playwright/test'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The six supported channel kinds. */
export type ChannelKind = 'dingtalk' | 'feishu' | 'wecom' | 'wxoa' | 'telegram' | 'discord'

/**
 * Optional per-call configuration for the channel emitter.
 *
 * Most fields are only relevant for channels that require signature auth.
 * Omit them to send unsigned payloads (sufficient for testing flows that do
 * not seed real channel credentials in the DB).
 */
export interface MockChannelOptions {
  /**
   * DingTalk signing secret used to compute the HMAC-SHA256 `sign` header.
   * Must match `config.secret` (or `config.appSecret` / `config.token`)
   * stored in the database for signature verification to pass.
   * Defaults to `'mock-dingtalk-secret'`.
   */
  dingtalkSecret?: string

  /**
   * WeCom corp ID written into the `<ToUserName>` XML tag.
   * Defaults to `'mock-corpid'`.
   */
  wecomCorpId?: string

  /**
   * WxOA app ID written into the `<ToUserName>` XML tag.
   * Defaults to `'mock-appid'`.
   */
  wxoaAppId?: string

  /**
   * Discord guild ID embedded in the payload for server matching.
   * Defaults to `'000000000000000001'`.
   */
  discordGuildId?: string
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:6100'

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------

/**
 * Builds an authentic DingTalk robot callback JSON payload for a text message.
 *
 * Shape verified against dingtalk plugin `parseMessage`:
 *   body.msgtype === 'text'
 *   body.text.content  — message text
 *   body.senderStaffId — sender user ID (required; empty → null)
 *   body.robotCode     — robot app key for credential matching
 *   body.conversationId, body.msgId, body.createAt
 */
function buildDingtalkPayload(text: string): string {
  return JSON.stringify({
    msgtype: 'text',
    text: { content: text },
    senderStaffId: 'mock-user-001',
    senderId: 'mock-user-001',
    robotCode: 'mock-robot-code',
    conversationId: 'mock-conversation-id',
    msgId: `mock-msg-${Date.now()}`,
    createAt: Date.now(),
  })
}

/**
 * Builds HMAC-SHA256 DingTalk signature headers.
 *
 * DingTalk robot callbacks include `timestamp` (ms since epoch) and `sign`
 * (base64 HMAC-SHA256 of `"{timestamp}\n{secret}"`) in request headers.
 * Verified against dingtalk plugin `verifySignature`.
 */
function buildDingtalkHeaders(secret: string): Record<string, string> {
  const timestamp = String(Date.now())
  const stringToSign = `${timestamp}\n${secret}`
  const sign = crypto.createHmac('sha256', secret).update(stringToSign).digest('base64')
  return {
    'Content-Type': 'application/json',
    timestamp,
    sign,
  }
}

/**
 * Builds a Feishu (Lark) event callback JSON payload for `im.message.receive_v1`.
 *
 * Shape verified against feishu plugin `parseMessage`:
 *   body.header.event_type === 'im.message.receive_v1'
 *   body.header.app_id     — for credential matching
 *   body.event.sender.sender_id.open_id
 *   body.event.message.message_type === 'text'
 *   body.event.message.content      — JSON string `{"text": "..."}`
 *   body.event.message.message_id, chat_id, chat_type, create_time
 *
 * Signature header is intentionally omitted: the plugin returns `true` when
 * `X-Lark-Signature` is absent (no encodingAESKey in test env).
 */
function buildFeishuPayload(text: string): string {
  return JSON.stringify({
    schema: '2.0',
    header: {
      event_id: `mock-event-${Date.now()}`,
      event_type: 'im.message.receive_v1',
      create_time: String(Date.now()),
      token: 'mock-verify-token',
      app_id: 'mock-app-id',
      tenant_key: 'mock-tenant',
    },
    event: {
      sender: {
        sender_id: {
          open_id: 'ou_mock_user_001',
          user_id: 'mock_uid_001',
        },
        sender_type: 'user',
      },
      message: {
        message_id: `om_mock_${Date.now()}`,
        root_id: '',
        parent_id: '',
        create_time: String(Date.now()),
        update_time: String(Date.now()),
        chat_id: 'oc_mock_chat_001',
        chat_type: 'p2p',
        message_type: 'text',
        content: JSON.stringify({ text }),
        mentions: [],
      },
    },
  })
}

/**
 * Builds a WeCom (Enterprise WeChat) encrypted XML webhook body.
 *
 * Shape verified against wecom plugin `parseMessage` and wecom-adapter:
 *   XML contains `<ToUserName>` (corpId) and `<Encrypt>` (AES-encrypted content).
 *   The actual decryption requires a valid `encodingAESKey` credential in the DB.
 *   In tests without a seeded credential the handler short-circuits to
 *   `200 success` before attempting decryption.
 *
 * A placeholder `<Encrypt>` tag is included so that `extractXmlTag` finds it
 * (required by `verifySignature` to attempt signature matching).
 */
function buildWecomPayload(corpId: string): string {
  return [
    '<xml>',
    `  <ToUserName><![CDATA[${corpId}]]></ToUserName>`,
    '  <Encrypt><![CDATA[mock-encrypted-content-placeholder]]></Encrypt>',
    '</xml>',
  ].join('\n')
}

/**
 * Builds a WeChat Official Account (WxOA) XML webhook body.
 *
 * Shape verified against wxoa plugin `parseMessage`:
 *   XML in plaintext mode contains `<MsgType>text</MsgType>`, `<Content>`,
 *   `<FromUserName>`, `<ToUserName>`, `<MsgId>`, `<CreateTime>`.
 *   Signature verification uses 3-parameter SHA1 (`token + timestamp + nonce`).
 *   Without a seeded credential the handler short-circuits before verifying.
 *
 * We send plaintext XML (no `<Encrypt>` tag) so the handler falls through to
 * the credential fallback path rather than attempting AES decryption.
 */
function buildWxoaPayload(appId: string, text: string): string {
  const now = Math.floor(Date.now() / 1000)
  return [
    '<xml>',
    `  <ToUserName><![CDATA[${appId}]]></ToUserName>`,
    '  <FromUserName><![CDATA[mock_openid_001]]></FromUserName>',
    `  <CreateTime>${now}</CreateTime>`,
    '  <MsgType><![CDATA[text]]></MsgType>',
    `  <Content><![CDATA[${text}]]></Content>`,
    `  <MsgId>${Date.now()}</MsgId>`,
    '</xml>',
  ].join('\n')
}

/**
 * Builds a Telegram Bot Update JSON payload for a plain text message.
 *
 * Shape verified against telegram plugin `parseMessage` and `TelegramUpdate`:
 *   body.update_id
 *   body.message.message_id, date, chat.id, from.id, from.first_name, text
 *   body.message.from.is_bot === false (required; bot messages are skipped)
 *
 * Signature verification is skipped when `telegramWebhookSecret` is absent
 * from the credential, which is the case in test environments.
 */
function buildTelegramPayload(text: string): string {
  const now = Math.floor(Date.now() / 1000)
  return JSON.stringify({
    update_id: Math.floor(Math.random() * 1_000_000),
    message: {
      message_id: Math.floor(Math.random() * 100_000),
      date: now,
      chat: {
        id: 100000001,
        type: 'private',
        first_name: 'MockUser',
      },
      from: {
        id: 100000001,
        is_bot: false,
        first_name: 'MockUser',
        username: 'mockuser',
        language_code: 'zh',
      },
      text,
    },
  })
}

/**
 * Builds a Discord MESSAGE_CREATE event JSON payload.
 *
 * Shape verified against discord plugin `parseMessage`:
 *   body.id, body.content, body.channel_id, body.guild_id, body.timestamp
 *   body.author.id, body.author.username, body.author.bot (must be falsy)
 *
 * The discord webhook route uses `guild_id` to match credentials.
 * `verifySignature` always returns `true` for Discord.
 */
function buildDiscordPayload(text: string, guildId: string): string {
  return JSON.stringify({
    type: 0,
    id: `mock-msg-${Date.now()}`,
    channel_id: 'mock-channel-001',
    guild_id: guildId,
    content: text,
    timestamp: new Date().toISOString(),
    author: {
      id: 'mock-user-001',
      username: 'MockUser',
      global_name: 'Mock User',
      bot: false,
    },
    attachments: [],
    embeds: [],
    mentions: [],
    mention_roles: [],
  })
}

// ---------------------------------------------------------------------------
// Internal dispatch table
// ---------------------------------------------------------------------------

/**
 * Builds the request body string and headers for a given channel.
 */
function buildPayload(
  channel: ChannelKind,
  text: string,
  opts: MockChannelOptions
): { body: string; headers: Record<string, string> } {
  switch (channel) {
    case 'dingtalk': {
      const secret = opts.dingtalkSecret ?? 'mock-dingtalk-secret'
      return {
        body: buildDingtalkPayload(text),
        headers: buildDingtalkHeaders(secret),
      }
    }

    case 'feishu':
      return {
        body: buildFeishuPayload(text),
        headers: { 'Content-Type': 'application/json' },
      }

    case 'wecom':
      return {
        body: buildWecomPayload(opts.wecomCorpId ?? 'mock-corpid'),
        headers: { 'Content-Type': 'application/xml' },
      }

    case 'wxoa':
      return {
        body: buildWxoaPayload(opts.wxoaAppId ?? 'mock-appid', text),
        headers: { 'Content-Type': 'application/xml' },
      }

    case 'telegram':
      return {
        body: buildTelegramPayload(text),
        headers: { 'Content-Type': 'application/json' },
      }

    case 'discord':
      return {
        body: buildDiscordPayload(text, opts.discordGuildId ?? '000000000000000001'),
        headers: { 'Content-Type': 'application/json' },
      }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Posts a simulated inbound channel message to the CrewMeld webhook endpoint.
 *
 * Constructs an authentic webhook payload for the given channel and POSTs it
 * to `POST /api/channels/{channel}/webhook/{employeeId}`. Returns the
 * Playwright `APIResponse` so callers can assert on `.ok()` / `.status()`.
 *
 * @param request    - Playwright `APIRequestContext` (the `request` fixture).
 * @param channel    - Target channel identifier.
 * @param employeeId - Digital employee ID that owns the webhook endpoint.
 * @param message    - Plain text message content to embed in the payload.
 * @param opts       - Optional per-channel authentication overrides.
 * @returns          Playwright `APIResponse` from the server.
 *
 * @example
 * ```ts
 * const res = await postChannelMessage(request, 'telegram', 'emp-abc', 'Hello')
 * expect(res.status()).not.toBe(404)
 * ```
 */
export async function postChannelMessage(
  request: APIRequestContext,
  channel: ChannelKind,
  employeeId: string,
  message: string,
  opts: MockChannelOptions = {}
): Promise<APIResponse> {
  const { body, headers } = buildPayload(channel, message, opts)

  const url = `${DEFAULT_BASE_URL}/api/channels/${channel}/webhook/${employeeId}`

  return request.post(url, {
    headers,
    data: body,
  })
}

import type { ConnectionType } from './types'

/**
 * Per-type whitelist of legitimate config keys.
 *
 * Covers every field declared on {@link ConnectionConfig} for the given type
 * (including fields not surfaced in the minimal admin form, e.g. custom_api's
 * Postman-style editor). Kept here rather than derived from
 * {@link CONNECTION_CONFIG_FIELDS} because the latter is scoped to simple
 * form rendering and omits advanced fields.
 */
const CONFIG_WHITELIST: Record<ConnectionType, readonly string[]> = {
  wecom: [
    'corpId',
    'corpSecret',
    'agentId',
    'token',
    'encodingAESKey',
    'boundEmployeeId',
    'webhookUrl',
  ],
  dingtalk: [
    'appKey',
    'appSecret',
    'robotCode',
    'secret',
    'aesKey',
    'token',
    'boundEmployeeId',
    'webhookUrl',
  ],
  feishu: ['appId', 'appSecret', 'encodingAESKey', 'token', 'boundEmployeeId', 'webhookUrl'],
  discord: ['botToken', 'guildId', 'discordChannelId', 'boundEmployeeId'],
  email: [
    'smtpHost',
    'smtpPort',
    'smtpSecure',
    'username',
    'password',
    'fromName',
    'fromAddress',
    'imapHost',
    'imapPort',
    'imapSecure',
    'boundEmployeeId',
  ],
  telegram: [
    'telegramBotToken',
    'telegramWebhookSecret',
    'boundEmployeeId',
    'webhookUrl',
    'timeout',
  ],
  wxoa: [
    'appId',
    'appSecret',
    'token',
    'encodingAESKey',
    'accountType',
    'boundEmployeeId',
    'webhookUrl',
  ],

  crm: ['apiEndpoint', 'apiKey', 'headers', 'timeout'],
  database: [
    'dbType',
    'host',
    'port',
    'database',
    'username',
    'password',
    'ssl',
    'connectionString',
    'timeout',
  ],
  custom_api: [
    'apiEndpoint',
    'apiKey',
    'httpMethod',
    'params',
    'customHeaders',
    'authType',
    'bearerToken',
    'basicUsername',
    'basicPassword',
    'bodyType',
    'bodyContent',
    'headers',
    'timeout',
  ],
  openclaw: ['gatewayUrl', 'gatewayToken', 'timeout'],
  dify: ['difyBaseUrl', 'difyAppApiKey', 'difyAppType', 'timeout'],
  n8n: ['n8nBaseUrl', 'n8nApiKey', 'n8nWorkflowId', 'timeout'],
  ragflow: ['ragflowEndpoint', 'apiKey', 'ragflowTimeoutMs', 'timeout'],
}

/**
 * Strip any key from the incoming config that is not in the whitelist for
 * the connection type. Prevents cross-type field contamination (e.g. a saved
 * email connection ending up with a meaningless `webhookUrl`) and silently
 * trims unknown keys instead of rejecting the whole payload.
 */
export function sanitizeConnectionConfig<T extends Record<string, unknown>>(
  type: ConnectionType,
  config: T
): Partial<T> {
  const allowed = CONFIG_WHITELIST[type]
  if (!allowed) return {}

  const out: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in config) {
      out[key] = (config as Record<string, unknown>)[key]
    }
  }
  return out as Partial<T>
}

/** Channel types that actually receive inbound webhooks (so `webhookUrl` injection is meaningful). */
export const WEBHOOK_CHANNEL_TYPES: readonly ConnectionType[] = [
  'wecom',
  'dingtalk',
  'feishu',
  'telegram',
  'wxoa',
]

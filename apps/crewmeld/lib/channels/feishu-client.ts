/**
 * Feishu API client - tenant_access_token management + message sending
 *
 * Feishu API docs: https://open.feishu.cn/document/server-docs
 */

import { createLogger } from '@crewmeld/logger'
import { t } from '@/lib/core/server-i18n'

const logger = createLogger('FeishuClient')

const FEISHU_BASE_URL = 'https://open.feishu.cn/open-apis'

/** Token cache (appId -> { token, expiresAt }) */
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

/** Token early refresh margin (seconds) */
const TOKEN_REFRESH_MARGIN_S = 300

/**
 * Get tenant_access_token (auto-cached + refreshed)
 */
export async function getTenantAccessToken(appId: string, appSecret: string): Promise<string> {
  const cached = tokenCache.get(appId)
  if (cached && cached.expiresAt > Date.now() / 1000 + TOKEN_REFRESH_MARGIN_S) {
    return cached.token
  }

  const res = await fetch(`${FEISHU_BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  })

  const data = (await res.json()) as {
    code: number
    msg: string
    tenant_access_token: string
    expire: number
  }

  if (data.code !== 0) {
    throw new Error(`${t('channelFeishuTokenFailed')}: ${data.msg}`)
  }

  tokenCache.set(appId, {
    token: data.tenant_access_token,
    expiresAt: Date.now() / 1000 + data.expire,
  })

  logger.info('Feishu tenant_access_token refreshed', { appId })
  return data.tenant_access_token
}

interface FeishuApiResult {
  code: number
  msg: string
  data?: Record<string, unknown>
}

/**
 * Call Feishu API (auto-attaches token + retries once on failure)
 */
export async function callFeishuApi<T extends FeishuApiResult>(
  appId: string,
  appSecret: string,
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  let token = await getTenantAccessToken(appId, appSecret)

  let res = await fetch(`${FEISHU_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  let result = (await res.json()) as T

  // Retry once when token expires
  if (result.code === 99991663 || result.code === 99991661) {
    tokenCache.delete(appId)
    token = await getTenantAccessToken(appId, appSecret)

    res = await fetch(`${FEISHU_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })

    result = (await res.json()) as T
  }

  return result
}

/**
 * Get Feishu user name by open_id
 *
 * Strategy chain (by priority):
 * 1. Contact API GET /contact/v3/users/{open_id} (requires contact:user.base:readonly)
 * 2. Chat member API GET /im/v1/chats/{chat_id}/members (only needs im:chat:readonly, bot has by default)
 *
 * Returns null when all strategies fail; caller handles fallback.
 */
export async function getFeishuUserName(
  appId: string,
  appSecret: string,
  openId: string,
  chatId?: string
): Promise<string | null> {
  const token = await getTenantAccessToken(appId, appSecret)

  // Strategy 1: Contact API (most direct, but requires contact permissions)
  try {
    const res = await fetch(
      `${FEISHU_BASE_URL}/contact/v3/users/${openId}?id_type=open_id&user_id_type=open_id`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      }
    )

    const result = (await res.json()) as {
      code: number
      msg: string
      data?: { user?: { name?: string } }
    }

    if (result.code === 0 && result.data?.user?.name) {
      logger.info('Feishu user name retrieved (Contact API)', {
        openId,
        name: result.data.user.name,
      })
      return result.data.user.name
    }

    logger.info('Feishu Contact API did not return name', {
      code: result.code,
      msg: result.msg,
      openId,
    })
  } catch (error) {
    logger.info('Feishu Contact API call failed', { openId, error })
  }

  // Strategy 2: Get name from chat member list (bot has im:chat:readonly by default)
  if (chatId) {
    try {
      const res = await fetch(
        `${FEISHU_BASE_URL}/im/v1/chats/${chatId}/members?member_id_type=open_id`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      const result = (await res.json()) as {
        code: number
        msg: string
        data?: { items?: Array<{ member_id?: string; name?: string; member_id_type?: string }> }
      }

      if (result.code === 0 && result.data?.items) {
        const member = result.data.items.find((m) => m.member_id === openId)
        if (member?.name) {
          logger.info('Feishu user name retrieved (Chat Member API)', {
            openId,
            chatId,
            name: member.name,
          })
          return member.name
        }
      }

      logger.info('Feishu Chat Member API did not match user', {
        code: result.code,
        msg: result.msg,
        openId,
        chatId,
      })
    } catch (error) {
      logger.info('Feishu Chat Member API call failed', { openId, chatId, error })
    }
  }

  logger.warn('All Feishu user name strategies failed', { openId, chatId })
  return null
}

/**
 * Send message (supports open_id / chat_id)
 *
 * @param receiveIdType - 'open_id' | 'chat_id' | 'user_id'
 */
export async function sendMessage(
  appId: string,
  appSecret: string,
  receiveId: string,
  receiveIdType: 'open_id' | 'chat_id' | 'user_id',
  msgType: string,
  content: string
): Promise<string | undefined> {
  const result = await callFeishuApi<FeishuApiResult & { data?: { message_id?: string } }>(
    appId,
    appSecret,
    `/im/v1/messages?receive_id_type=${receiveIdType}`,
    {
      receive_id: receiveId,
      msg_type: msgType,
      content,
    }
  )

  if (result.code !== 0) {
    logger.error('Feishu message send failed', { code: result.code, msg: result.msg, receiveId })
    throw new Error(`${t('channelFeishuSendFailed')}: ${result.msg}`)
  }

  const messageId = result.data?.message_id as string | undefined
  logger.info('Feishu message sent successfully', { receiveId, messageId })
  return messageId
}

/**
 * Reply to a message (reply to message_id)
 */
export async function replyMessage(
  appId: string,
  appSecret: string,
  messageId: string,
  msgType: string,
  content: string
): Promise<string | undefined> {
  const result = await callFeishuApi<FeishuApiResult & { data?: { message_id?: string } }>(
    appId,
    appSecret,
    `/im/v1/messages/${messageId}/reply`,
    {
      msg_type: msgType,
      content,
    }
  )

  if (result.code !== 0) {
    logger.error('Feishu message reply failed', { code: result.code, msg: result.msg, messageId })
    throw new Error(`${t('channelFeishuReplyFailed')}: ${result.msg}`)
  }

  return result.data?.message_id as string | undefined
}

/**
 * Upload file to Feishu, returns file_key
 *
 * @see https://open.feishu.cn/document/server-docs/im-v1/file/create
 */
export async function uploadFile(
  appId: string,
  appSecret: string,
  fileName: string,
  fileBuffer: Buffer,
  fileType: 'opus' | 'mp4' | 'pdf' | 'doc' | 'xls' | 'ppt' | 'stream' = 'stream'
): Promise<string> {
  const token = await getTenantAccessToken(appId, appSecret)

  const formData = new FormData()
  formData.append('file_type', fileType)
  formData.append('file_name', fileName)
  formData.append('file', new Blob([new Uint8Array(fileBuffer)]), fileName)

  const res = await fetch(`${FEISHU_BASE_URL}/im/v1/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })

  const result = (await res.json()) as FeishuApiResult & { data?: { file_key?: string } }

  if (result.code !== 0 || !result.data?.file_key) {
    throw new Error(`${t('channelFeishuUploadFailed')}: ${result.msg} (code=${result.code})`)
  }

  logger.info('Feishu file uploaded successfully', { fileName, fileKey: result.data.file_key })
  return result.data.file_key
}

/**
 * Download file resource from a message
 *
 * @see https://open.feishu.cn/document/server-docs/im-v1/message-attachment/get
 */
export async function downloadMessageFile(
  appId: string,
  appSecret: string,
  messageId: string,
  fileKey: string
): Promise<Buffer> {
  const token = await getTenantAccessToken(appId, appSecret)

  const res = await fetch(
    `${FEISHU_BASE_URL}/im/v1/messages/${messageId}/resources/${fileKey}?type=file`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }
  )

  if (!res.ok) {
    throw new Error(`${t('channelFeishuDownloadFailed')}: HTTP ${res.status}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  logger.info('Feishu file downloaded successfully', {
    messageId,
    fileKey,
    size: arrayBuffer.byteLength,
  })
  return Buffer.from(arrayBuffer)
}

/**
 * Send file message
 */
export async function sendFileMessage(
  appId: string,
  appSecret: string,
  receiveId: string,
  receiveIdType: 'open_id' | 'chat_id' | 'user_id',
  fileKey: string
): Promise<string | undefined> {
  return sendMessage(
    appId,
    appSecret,
    receiveId,
    receiveIdType,
    'file',
    JSON.stringify({ file_key: fileKey })
  )
}

/**
 * Update message card content (for streaming updates or approval status changes)
 */
export async function updateMessageCard(
  appId: string,
  appSecret: string,
  messageId: string,
  cardContent: Record<string, unknown>
): Promise<void> {
  const token = await getTenantAccessToken(appId, appSecret)

  const res = await fetch(`${FEISHU_BASE_URL}/im/v1/messages/${messageId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      content: JSON.stringify(cardContent),
    }),
  })

  const result = (await res.json()) as FeishuApiResult

  if (result.code !== 0) {
    logger.warn('Feishu card update failed', { code: result.code, msg: result.msg, messageId })
  }
}

/**
 * WeChat Official Account message sending service
 *
 * Pushes replies to users via the Customer Service Message API (requires verified service account).
 * https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Service_Center_messages.html
 */

import { createLogger } from '@crewmeld/logger'
import { t } from '@/lib/core/server-i18n'
import { chunkForChannel } from './chunk'
import { getWxoaAccessToken } from './wxoa-token'

const logger = createLogger('WxoaSender')

interface WxoaApiResult {
  errcode: number
  errmsg: string
}

/**
 * Send a customer service text message
 */
export async function sendWxoaText(
  appId: string,
  appSecret: string,
  toUser: string,
  content: string
): Promise<void> {
  const accessToken = await getWxoaAccessToken(appId, appSecret)
  const url = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      touser: toUser,
      msgtype: 'text',
      text: { content },
    }),
  })

  const result = (await res.json()) as WxoaApiResult
  if (result.errcode !== 0) {
    logger.error('Customer service message send failed', {
      errcode: result.errcode,
      errmsg: result.errmsg,
      toUser,
    })
    throw new Error(`${t('channelWxoaSendFailed')}: ${result.errcode} ${result.errmsg}`)
  }

  logger.info('Customer service message send succeeded', { toUser, contentLen: content.length })
}

/**
 * Markdown → plain text (Official Account does not support Markdown rendering)
 */
function stripMarkdown(text: string): string {
  return (
    text
      // Headings: ## title → title
      .replace(/^#{1,6}\s+/gm, '')
      // Bold: **text** → text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      // Italic: *text* → text
      .replace(/\*(.+?)\*/g, '$1')
      // Inline code: `code` → code
      .replace(/`(.+?)`/g, '$1')
      // Links: [text](url) → text (url)
      .replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)')
      // Images: ![alt](url) → [Image: alt]
      .replace(/!\[(.+?)\]\(.+?\)/g, `[${t('channelWxoaImageLabel')}: $1]`)
      // Unordered list: - item → · item
      .replace(/^[-*]\s+/gm, '· ')
      // Horizontal rule: --- → ——
      .replace(/^-{3,}$/gm, '——')
      // Compress excessive blank lines
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/**
 * Send long text (auto-chunked, Markdown converted to plain text)
 */
export async function sendWxoaChunked(
  appId: string,
  appSecret: string,
  toUser: string,
  content: string
): Promise<void> {
  const plainText = stripMarkdown(content)
  const chunks = chunkForChannel(plainText, 'wxoa')

  for (const chunk of chunks) {
    await sendWxoaText(appId, appSecret, toUser, chunk)
  }
}

/**
 * Send a customer service image message
 */
export async function sendWxoaImage(
  appId: string,
  appSecret: string,
  toUser: string,
  mediaId: string
): Promise<void> {
  const accessToken = await getWxoaAccessToken(appId, appSecret)
  const url = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      touser: toUser,
      msgtype: 'image',
      image: { media_id: mediaId },
    }),
  })

  const result = (await res.json()) as WxoaApiResult
  if (result.errcode !== 0) {
    logger.error('Image message send failed', { errcode: result.errcode, errmsg: result.errmsg })
    throw new Error(`${t('channelWxoaImageFailed')}: ${result.errcode} ${result.errmsg}`)
  }
}

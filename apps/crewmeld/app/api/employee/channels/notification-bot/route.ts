import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import {
  clearNotificationBotChannelId,
  getNotificationBotChannelId,
  setNotificationBotChannelId,
} from '@/lib/connectors/notification-bot'

/**
 * GET /api/employee/channels/notification-bot?type=feishu
 * Get the currently configured notification bot
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission('channel:edit')
  if (!auth.authenticated || auth.error) {
    return apiAuthErr(auth)
  }

  const channelType = new URL(request.url).searchParams.get('type') ?? 'feishu'
  const channelId = await getNotificationBotChannelId(channelType)

  return apiOk({ channelId })
}

/**
 * POST /api/employee/channels/notification-bot
 * Set notification bot
 */
async function _POST(request: NextRequest) {
  const auth = await requirePermission('channel:edit')
  if (!auth.authenticated || auth.error) {
    return apiAuthErr(auth)
  }

  const { channelType, channelId } = (await request.json()) as {
    channelType: string
    channelId: string
  }

  if (!channelType || !channelId) {
    return apiErr('api.channel.invalidParams', { status: 400 })
  }

  await setNotificationBotChannelId(channelType, channelId, auth.userId!)

  return apiOk(null)
}

/**
 * DELETE /api/employee/channels/notification-bot
 * Clear notification bot settings
 */
async function _DELETE(request: NextRequest) {
  const auth = await requirePermission('channel:edit')
  if (!auth.authenticated || auth.error) {
    return apiAuthErr(auth)
  }

  const { channelType } = (await request.json()) as { channelType: string }
  if (!channelType) {
    return apiErr('api.channel.invalidParams', { status: 400 })
  }

  await clearNotificationBotChannelId(channelType)

  return apiOk(null)
}

export const POST = withAudit(_POST)
export const DELETE = withAudit(_DELETE)

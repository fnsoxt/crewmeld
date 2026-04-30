/**
 * Notification bot config — admin specifies which channel connection to use for sending approval notifications to collaborators
 *
 * Stored in platformSettings table: key = 'notification_bot:{channelType}'
 */

import { db } from '@crewmeld/db'
import { platformSettings } from '@crewmeld/db/schema'
import { eq } from 'drizzle-orm'

function settingsKey(channelType: string): string {
  return `notification_bot:${channelType}`
}

/**
 * Get notification bot connection ID for specified channel type
 */
export async function getNotificationBotChannelId(channelType: string): Promise<string | null> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, settingsKey(channelType)))
    .limit(1)

  if (!row) return null
  const val = row.value as { channelId?: string }
  return val.channelId ?? null
}

/**
 * Set notification bot for specified channel type
 */
export async function setNotificationBotChannelId(
  channelType: string,
  channelId: string,
  userId: string
): Promise<void> {
  const key = settingsKey(channelType)
  const now = new Date()

  const [existing] = await db
    .select({ key: platformSettings.key })
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .limit(1)

  if (existing) {
    await db
      .update(platformSettings)
      .set({
        value: { channelId },
        updatedAt: now,
        updatedBy: userId,
      })
      .where(eq(platformSettings.key, key))
  } else {
    await db.insert(platformSettings).values({
      key,
      value: { channelId },
      updatedAt: now,
      updatedBy: userId,
    })
  }
}

/**
 * Clear notification bot setting for specified channel type
 */
export async function clearNotificationBotChannelId(channelType: string): Promise<void> {
  await db.delete(platformSettings).where(eq(platformSettings.key, settingsKey(channelType)))
}

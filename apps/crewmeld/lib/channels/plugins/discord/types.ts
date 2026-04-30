/**
 * Discord plugin config types + Zod schema
 */

import { z } from 'zod'

export const discordPluginConfigSchema = z.object({
  botToken: z.string().min(1),
  /** Restrict to a specific server ID (optional) */
  guildId: z.string().optional(),
  /** Restrict to a specific channel ID (optional) */
  discordChannelId: z.string().optional(),
  boundEmployeeId: z.string().optional(),
  workspaceId: z.string().optional(),
})

export type DiscordPluginConfig = z.infer<typeof discordPluginConfigSchema>

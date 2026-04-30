/**
 * Feishu plugin config types + Zod schema
 */

import { z } from 'zod'

export const feishuPluginConfigSchema = z.object({
  appId: z.string().min(1),
  appSecret: z.string().min(1),
  encodingAESKey: z.string().optional(),
  token: z.string().optional(),
  boundEmployeeId: z.string().optional(),
  webhookUrl: z.string().optional(),
})

export type FeishuPluginConfig = z.infer<typeof feishuPluginConfigSchema>

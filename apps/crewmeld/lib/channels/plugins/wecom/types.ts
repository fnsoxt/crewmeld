/**
 * WeCom plugin config types + Zod schema
 */

import { z } from 'zod'

export const wecomPluginConfigSchema = z.object({
  corpId: z.string().min(1),
  corpSecret: z.string().min(1),
  agentId: z.string().min(1),
  token: z.string().min(1),
  encodingAESKey: z.string().min(1),
  boundEmployeeId: z.string().optional(),
  webhookUrl: z.string().optional(),
})

export type WeComPluginConfig = z.infer<typeof wecomPluginConfigSchema>

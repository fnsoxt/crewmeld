/**
 * DingTalk plugin config types + Zod schema
 */

import { z } from 'zod'

export const dingtalkPluginConfigSchema = z.object({
  appKey: z.string().min(1),
  appSecret: z.string().min(1),
  robotCode: z.string().optional(),
  /** Robot signing secret (uses appSecret for verification if not set) */
  secret: z.string().optional(),
  /** Event subscription encryption aes_key (43-char base64 without padding) */
  aesKey: z.string().optional(),
  /** Event subscription signature token */
  token: z.string().optional(),
  /** suiteKey for encrypting responses (usually equals appKey) */
  suiteKey: z.string().optional(),
  boundEmployeeId: z.string().optional(),
  workspaceId: z.string().optional(),
})

export type DingtalkPluginConfig = z.infer<typeof dingtalkPluginConfigSchema>

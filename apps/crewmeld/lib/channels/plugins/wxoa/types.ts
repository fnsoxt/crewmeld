/**
 * WeChat Official Account plugin config types + Zod schema
 */

import { z } from 'zod'

export const wxoaPluginConfigSchema = z.object({
  /** Official Account AppID */
  appId: z.string().min(1),
  /** Official Account AppSecret */
  appSecret: z.string().min(1),
  /** Message verification Token */
  token: z.string().min(1),
  /** Message encryption/decryption key (safe mode, optional) */
  encodingAESKey: z.string().optional(),
  /** Account type: service account / subscription account */
  accountType: z.enum(['service', 'subscription']).optional(),
  /** Bound digital employee ID */
  boundEmployeeId: z.string().optional(),
  /** Webhook URL (read-only, auto-generated) */
  webhookUrl: z.string().optional(),
})

export type WxoaPluginConfig = z.infer<typeof wxoaPluginConfigSchema>

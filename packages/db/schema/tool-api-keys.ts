import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Tool API Key config table — globally shared
 *
 * Third-party API Keys used during AI tool generation (e.g. Alibaba Cloud AppCode).
 * Values are stored encrypted with the same AES-256-GCM as system connections.
 */
export const toolApiKeys = pgTable('tool_api_keys', {
  /** Fixed ID = 'global', single global record */
  id: text('id').primaryKey(),
  /** Encrypted API Keys JSON array: [{ name, value }] */
  keysEncrypted: text('keys_encrypted').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

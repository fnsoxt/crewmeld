import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from '../schema'

export const platformSettings = pgTable('platform_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
})

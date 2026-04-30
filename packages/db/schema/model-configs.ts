import { boolean, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const modelConfigs = pgTable(
  'model_configs',
  {
    id: text('id').primaryKey(),
    providerId: text('provider_id').notNull(),
    displayName: text('display_name').notNull(),
    apiKeyEncrypted: text('api_key_encrypted'),
    apiEndpoint: text('api_endpoint'),
    modelName: text('model_name'),
    defaultParams: jsonb('default_params').notNull().default('{}'),
    isActive: boolean('is_active').notNull().default(false),
    lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
    lastTestResult: text('last_test_result'),
    lastTestLatencyMs: integer('last_test_latency_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    providerIdIdx: index('model_configs_provider_id_idx').on(table.providerId),
    isActiveIdx: index('model_configs_is_active_idx').on(table.isActive),
  })
)

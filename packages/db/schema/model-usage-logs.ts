import { decimal, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * LLM usage logs — one record written per LLM call
 */
export const modelUsageLogs = pgTable(
  'model_usage_logs',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    tokensInput: integer('tokens_input').notNull().default(0),
    tokensOutput: integer('tokens_output').notNull().default(0),
    tokensTotal: integer('tokens_total').notNull().default(0),
    costInput: decimal('cost_input', { precision: 12, scale: 6 }).notNull().default('0'),
    costOutput: decimal('cost_output', { precision: 12, scale: 6 }).notNull().default('0'),
    costTotal: decimal('cost_total', { precision: 12, scale: 6 }).notNull().default('0'),
    durationMs: integer('duration_ms'),
    workflowId: text('workflow_id'),
    workspaceId: text('workspace_id'),
    userId: text('user_id'),
    employeeId: text('employee_id'),
    status: text('status').notNull().default('success'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    modelIdx: index('model_usage_logs_model_idx').on(table.model),
    providerIdx: index('model_usage_logs_provider_idx').on(table.provider),
    createdAtIdx: index('model_usage_logs_created_at_idx').on(table.createdAt),
    workspaceIdx: index('model_usage_logs_workspace_id_idx').on(table.workspaceId),
    employeeIdx: index('model_usage_logs_employee_id_idx').on(table.employeeId),
    modelCreatedAtIdx: index('model_usage_logs_model_created_at_idx').on(
      table.model,
      table.createdAt
    ),
  })
)

import { index, jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { modelConfigs } from './model-configs'

export const employeeStatusEnum = pgEnum('employee_status', [
  'standby',
  'active',
  'paused',
  'error',
])

export type EmployeeStatus = (typeof employeeStatusEnum.enumValues)[number]

export const digitalEmployees = pgTable(
  'digital_employees',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    avatar: text('avatar'),
    description: text('description'),
    blockType: text('block_type').notNull(),
    status: employeeStatusEnum('status').notNull().default('standby'),
    /** @deprecated Legacy pointer into the removed workflow table. Retained
     * as a plain text column to preserve historical rows; no FK. */
    workflowId: text('workflow_id'),
    modelConfigId: text('model_config_id').references(() => modelConfigs.id, {
      onDelete: 'set null',
    }),
    config: jsonb('config').notNull().default('{}'),
    scheduleConfig: jsonb('schedule_config'),
    persona: text('persona'),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('digital_employees_status_idx').on(table.status),
    workflowIdIdx: index('digital_employees_workflow_id_idx').on(table.workflowId),
    modelConfigIdIdx: index('digital_employees_model_config_id_idx').on(table.modelConfigId),
  })
)

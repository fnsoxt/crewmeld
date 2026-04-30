import { boolean, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { sopDefinitions } from './sop-definitions'

/**
 * Scheduled task table — scheduled plans created by users in the task center
 *
 * Each record is bound to an SOP and triggers execution on a cron schedule.
 * Execution records reuse the sop_executions table, linked via scheduledTaskId.
 */
export const scheduledTasks = pgTable(
  'scheduled_tasks',
  {
    id: text('id').primaryKey(),
    /** Task name */
    name: text('name').notNull(),
    /** Associated SOP */
    sopDefinitionId: text('sop_definition_id')
      .notNull()
      .references(() => sopDefinitions.id, { onDelete: 'cascade' }),
    /** Cron expression */
    cron: text('cron').notNull(),
    /** Timezone, default Asia/Shanghai */
    timezone: text('timezone').notNull().default('Asia/Shanghai'),
    /** Parameters passed to SOP on trigger */
    triggerData: jsonb('trigger_data'),
    /** Whether enabled */
    isActive: boolean('is_active').notNull().default(true),
    /** Last run time */
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    /** Next run time */
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    /** Created by */
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sopDefIdx: index('st_sop_definition_id_idx').on(table.sopDefinitionId),
    isActiveIdx: index('st_is_active_idx').on(table.isActive),
    nextRunIdx: index('st_next_run_at_idx').on(table.nextRunAt),
    createdByIdx: index('st_created_by_idx').on(table.createdBy),
  })
)

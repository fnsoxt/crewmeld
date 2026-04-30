import {
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { digitalEmployees } from './employee'

export const dailyStats = pgTable(
  'daily_stats',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => digitalEmployees.id, { onDelete: 'cascade' }),
    statDate: date('stat_date').notNull(),
    totalTasks: integer('total_tasks').notNull().default(0),
    successCount: integer('success_count').notNull().default(0),
    failureCount: integer('failure_count').notNull().default(0),
    hitlCount: integer('hitl_count').notNull().default(0),
    avgDurationMs: integer('avg_duration_ms'),
    tokensConsumed: integer('tokens_consumed').notNull().default(0),
    costRmb: decimal('cost_rmb', { precision: 12, scale: 4 }).notNull().default('0'),
    customMetrics: jsonb('custom_metrics').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    employeeIdIdx: index('daily_stats_employee_id_idx').on(table.employeeId),
    statDateIdx: index('daily_stats_stat_date_idx').on(table.statDate),
    employeeDateUnique: uniqueIndex('daily_stats_employee_date_unique').on(
      table.employeeId,
      table.statDate
    ),
  })
)

import { index, jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { digitalEmployees } from './employee'
import { taskExecutions } from './task-executions'

export const workLogTypeEnum = pgEnum('work_log_type', [
  'action',
  'decision',
  'tool_call',
  'llm_call',
  'error',
])

export type WorkLogType = (typeof workLogTypeEnum.enumValues)[number]

export const workLogs = pgTable(
  'work_logs',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => taskExecutions.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => digitalEmployees.id, { onDelete: 'cascade' }),
    logType: workLogTypeEnum('log_type').notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskIdIdx: index('work_logs_task_id_idx').on(table.taskId),
    employeeIdIdx: index('work_logs_employee_id_idx').on(table.employeeId),
    logTypeIdx: index('work_logs_log_type_idx').on(table.logType),
    taskLogTypeIdx: index('work_logs_task_log_type_idx').on(table.taskId, table.logType),
    createdAtIdx: index('work_logs_created_at_idx').on(table.createdAt),
  })
)

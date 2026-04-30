import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { digitalEmployees } from './employee'

/**
 * Digital employee to workflow bindings (many-to-many).
 *
 * Note: the upstream workflow canvas has been removed. The workflowId
 * column is retained as a plain text reference — new rows are no longer
 * created, but historical rows and stats queries that join through this
 * table continue to work (returning empty sets).
 */
export const employeeWorkflowBindings = pgTable(
  'employee_workflow_bindings',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => digitalEmployees.id, { onDelete: 'cascade' }),
    workflowId: text('workflow_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    employeeIdIdx: index('ewb_employee_id_idx').on(table.employeeId),
    workflowIdIdx: index('ewb_workflow_id_idx').on(table.workflowId),
    uniqueBinding: uniqueIndex('ewb_unique_idx').on(table.employeeId, table.workflowId),
  })
)

import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { digitalEmployees } from './employee'
import { systemConnections } from './system-connections'

/**
 * Digital employee to system connection bindings (many-to-many)
 */
export const employeeConnections = pgTable(
  'employee_connections',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => digitalEmployees.id, { onDelete: 'cascade' }),
    connectionId: text('connection_id')
      .notNull()
      .references(() => systemConnections.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    employeeIdIdx: index('ec_employee_id_idx').on(table.employeeId),
    connectionIdIdx: index('ec_connection_id_idx').on(table.connectionId),
    uniqueBinding: uniqueIndex('ec_unique_idx').on(table.employeeId, table.connectionId),
  })
)

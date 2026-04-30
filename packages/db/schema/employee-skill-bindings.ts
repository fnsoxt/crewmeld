import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { digitalEmployees } from './employee'

/**
 * Digital employee to tool instance binding (many-to-many)
 *
 * instanceId corresponds to tool_instances table instance ID.
 * skillId retained for compatibility (corresponds to template ID); new logic uses instanceId primarily.
 * Only deployed (deploy.status === 'deployed') instances can be bound.
 */
export const employeeSkillBindings = pgTable(
  'employee_skill_bindings',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => digitalEmployees.id, { onDelete: 'cascade' }),
    /** Template ID (legacy field) */
    skillId: text('skill_id').notNull(),
    /** Instance ID — the actually bound tool instance */
    instanceId: text('instance_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    employeeIdIdx: index('esb_employee_id_idx').on(table.employeeId),
    skillIdIdx: index('esb_skill_id_idx').on(table.skillId),
    instanceIdIdx: index('esb_instance_id_idx').on(table.instanceId),
    uniqueBinding: uniqueIndex('esb_unique_instance_idx').on(table.employeeId, table.instanceId),
  })
)

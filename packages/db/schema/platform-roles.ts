import { boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { user } from '../schema'

/**
 * Platform role enum
 * - super_admin: Super admin, can manage users, roles, SSO, templates, system settings
 * - admin: Admin, can manage digital employees, tasks, templates, but not users or system settings
 * - member: Regular user, read-only access to overview, digital employees, tasks, reports
 */
export const platformRoleEnum = pgEnum('platform_role', ['super_admin', 'admin', 'member'])

export type PlatformRole = (typeof platformRoleEnum.enumValues)[number]

export const employeePlatformRoles = pgTable(
  'employee_platform_roles',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: platformRoleEnum('role').notNull().default('member'),
    isDisabled: boolean('is_disabled').notNull().default(false),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdUnique: uniqueIndex('employee_platform_roles_user_id_unique').on(table.userId),
    roleIdx: index('employee_platform_roles_role_idx').on(table.role),
    disabledIdx: index('employee_platform_roles_disabled_idx').on(table.isDisabled),
  })
)

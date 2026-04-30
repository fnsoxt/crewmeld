import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { platformRoleEnum } from './platform-roles'

/**
 * Platform permission definition table
 * Stores all assignable permissions in the system, grouped by module
 * Note: table name is platform_permission_defs to avoid conflict with upstream engine's permissions table
 */
export const platformPermissionDefs = pgTable(
  'platform_permission_defs',
  {
    /** Permission code as primary key, format: module:action (e.g. user:list, employee:create) */
    code: text('code').primaryKey(),
    /** Permission name (Chinese) */
    name: text('name').notNull(),
    /** Permission description */
    description: text('description'),
    /** Module (for frontend grouping) */
    category: text('category').notNull(),
    /** Sort order field */
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    categoryIdx: index('platform_permission_defs_category_idx').on(table.category),
    sortIdx: index('platform_permission_defs_sort_order_idx').on(table.sortOrder),
  })
)

/**
 * Platform role-permission association table
 * Each row indicates a role has a specific permission
 */
export const platformRolePermissions = pgTable(
  'platform_role_permissions',
  {
    id: text('id').primaryKey(),
    /** Role */
    role: platformRoleEnum('role').notNull(),
    /** Permission code, references platform_permission_defs.code */
    permissionCode: text('permission_code')
      .notNull()
      .references(() => platformPermissionDefs.code, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => ({
    rolePermUnique: uniqueIndex('platform_role_perms_role_perm_unique').on(
      table.role,
      table.permissionCode
    ),
    roleIdx: index('platform_role_perms_role_idx').on(table.role),
  })
)

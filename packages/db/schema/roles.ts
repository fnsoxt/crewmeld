import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * First-class role definitions — decoupled from employee_templates.
 * Each row represents a reusable role persona that an operator can select
 * when onboarding a new digital employee.
 */
export const roles = pgTable(
  'roles',
  {
    id: text('id').primaryKey(),
    /** Display name shown in the role picker */
    name: text('name').notNull(),
    description: text('description'),
    /** System prompt / persona text pre-loaded into the employee */
    persona: text('persona'),
    /**
     * Broad category for UI grouping.
     * Open-ended string so future categories don't require a migration.
     */
    category: text('category').notNull().default('general'),
    /** Emoji or URL used as the role icon in the picker */
    icon: text('icon'),
    /** Block type that this role defaults to: "agent" | "function" */
    blockType: text('block_type').notNull().default('agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    categoryIdx: index('roles_category_idx').on(table.category),
    createdAtIdx: index('roles_created_at_idx').on(table.createdAt),
  })
)

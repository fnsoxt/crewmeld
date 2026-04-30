import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Contact method type constants — aligned with CONNECTION_TYPES
 */
export const CONTACT_METHOD_TYPES = [
  'email',
  'wecom',
  'dingtalk',
  'feishu',
  'discord',
  'telegram',
] as const
export type ContactMethodType = (typeof CONTACT_METHOD_TYPES)[number]

/**
 * Contact method interface
 */
export interface ContactMethod {
  type: ContactMethodType
  value: string
}

/**
 * contact type → system_connections.type mapping
 * Used to look up system connection credentials for the corresponding channel
 */
export const CONTACT_TO_CONNECTION_TYPE: Record<ContactMethodType, string> = {
  email: 'email',
  wecom: 'wecom',
  dingtalk: 'dingtalk',
  feishu: 'feishu',
  discord: 'discord',
  telegram: 'telegram',
}

/**
 * Human employees table — Doc 06 (Human Employee Management Module)
 *
 * The SOP module's human_confirm node references this table via assigneeId,
 * supporting approval notifications sent through contact methods.
 */
export const humanEmployees = pgTable(
  'human_employees',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    title: text('title').notNull(),
    department: text('department'),

    /**
     * Contact methods array — ContactMethod[]
     */
    contactMethods: jsonb('contact_methods').notNull().default('[]'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: index('human_emp_name_idx').on(table.name),
    titleIdx: index('human_emp_title_idx').on(table.title),
  })
)

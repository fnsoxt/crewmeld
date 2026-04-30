import { index, jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { digitalEmployees } from './employee'

export const alertSeverityEnum = pgEnum('alert_severity', ['critical', 'warning', 'info'])

export const alertStatusEnum = pgEnum('alert_status', ['open', 'acknowledged', 'resolved'])

export const alertCategoryEnum = pgEnum('alert_category', [
  'task_failure',
  'employee_error',
  'system_error',
  'performance',
  'security',
])

export type AlertSeverity = (typeof alertSeverityEnum.enumValues)[number]
export type AlertStatus = (typeof alertStatusEnum.enumValues)[number]
export type AlertCategory = (typeof alertCategoryEnum.enumValues)[number]

export const anomalyAlerts = pgTable(
  'anomaly_alerts',
  {
    id: text('id').primaryKey(),
    severity: alertSeverityEnum('severity').notNull(),
    status: alertStatusEnum('status').notNull().default('open'),
    category: alertCategoryEnum('category').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    employeeId: text('employee_id').references(() => digitalEmployees.id, {
      onDelete: 'set null',
    }),
    employeeName: text('employee_name'),
    taskExecutionId: text('task_execution_id'),
    errorMessage: text('error_message'),
    errorStack: text('error_stack'),
    metadata: jsonb('metadata').default('{}'),
    resolvedBy: text('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    severityStatusIdx: index('anomaly_alerts_severity_status_idx').on(table.severity, table.status),
    categoryIdx: index('anomaly_alerts_category_idx').on(table.category),
    employeeIdIdx: index('anomaly_alerts_employee_id_idx').on(table.employeeId),
    statusCreatedIdx: index('anomaly_alerts_status_created_idx').on(table.status, table.createdAt),
    createdAtIdx: index('anomaly_alerts_created_at_idx').on(table.createdAt),
  })
)

import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { digitalEmployees } from './employee'
import { sopExecutions } from './sop-executions'

export const taskTriggerTypeEnum = pgEnum('task_trigger_type', [
  'scheduled',
  'manual',
  'event',
  'webhook',
  'api',
  'sop',
  'conversation',
])

export const taskStatusEnum = pgEnum('task_status', [
  'pending',
  'running',
  'success',
  'failed',
  'hitl_waiting',
])

export type TaskTriggerType = (typeof taskTriggerTypeEnum.enumValues)[number]
export type TaskStatus = (typeof taskStatusEnum.enumValues)[number]

export const taskExecutions = pgTable(
  'task_executions',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => digitalEmployees.id, { onDelete: 'cascade' }),
    workflowRunId: text('workflow_run_id'),
    sopExecutionId: text('sop_execution_id').references(() => sopExecutions.id, {
      onDelete: 'set null',
    }),
    triggerType: taskTriggerTypeEnum('trigger_type').notNull(),
    status: taskStatusEnum('status').notNull().default('pending'),
    input: jsonb('input').notNull().default('{}'),
    output: jsonb('output'),
    inputSummary: text('input_summary'),
    outputSummary: text('output_summary'),
    tokensUsed: integer('tokens_used').notNull().default(0),
    costRmb: decimal('cost_rmb', { precision: 12, scale: 4 }).notNull().default('0'),
    durationMs: integer('duration_ms'),
    errorMessage: text('error_message'),
    requiresReview: boolean('requires_review').notNull().default(false),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    employeeIdIdx: index('task_executions_employee_id_idx').on(table.employeeId),
    statusIdx: index('task_executions_status_idx').on(table.status),
    employeeStatusIdx: index('task_executions_employee_status_idx').on(
      table.employeeId,
      table.status
    ),
    workflowRunIdIdx: index('task_executions_workflow_run_id_idx').on(table.workflowRunId),
    startedAtIdx: index('task_executions_started_at_idx').on(table.startedAt),
    requiresReviewIdx: index('task_executions_requires_review_idx').on(table.requiresReview),
  })
)

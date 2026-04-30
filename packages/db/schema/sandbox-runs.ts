import { index, integer, jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Sandbox run type enum
 */
export const sandboxRunTypeEnum = pgEnum('sandbox_run_type', [
  'node_test',
  'workflow_run',
  'sop_run',
])
export type SandboxRunType = (typeof sandboxRunTypeEnum.enumValues)[number]

/**
 * Sandbox run status enum
 */
export const sandboxRunStatusEnum = pgEnum('sandbox_run_status', [
  'pending',
  'running',
  'waiting_for_input',
  'completed',
  'failed',
  'cancelled',
  'timeout',
])
export type SandboxRunStatus = (typeof sandboxRunStatusEnum.enumValues)[number]

/**
 * Terminal status constants
 */
export const SANDBOX_TERMINAL_STATUSES: SandboxRunStatus[] = [
  'completed',
  'failed',
  'cancelled',
  'timeout',
]

/**
 * Sandbox runs table
 *
 * Records the full lifecycle of each sandbox run.
 * State machine: pending -> running -> completed | failed | cancelled | timeout
 *                running -> waiting_for_input -> running (SOP human decision)
 */
export const sandboxRuns = pgTable(
  'sandbox_runs',
  {
    id: text('id').primaryKey(),
    runType: sandboxRunTypeEnum('run_type').notNull(),
    status: sandboxRunStatusEnum('status').notNull().default('pending'),
    workflowId: text('workflow_id'),
    sopDefinitionId: text('sop_definition_id'),
    targetNodeId: text('target_node_id'),
    triggerData: jsonb('trigger_data'),
    policy: jsonb('policy'),
    nodeResults: jsonb('node_results').default('[]'),
    interceptedCalls: jsonb('intercepted_calls').default('[]'),
    executionPath: jsonb('execution_path').default('[]'),
    mockDecisions: jsonb('mock_decisions').default('{}'),
    errorMessage: text('error_message'),
    totalDurationMs: integer('total_duration_ms'),
    totalTokensUsed: integer('total_tokens_used').default(0),
    createdBy: text('created_by').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    workflowIdIdx: index('sandbox_runs_workflow_id_idx').on(table.workflowId),
    sopDefinitionIdIdx: index('sandbox_runs_sop_definition_id_idx').on(table.sopDefinitionId),
    statusIdx: index('sandbox_runs_status_idx').on(table.status),
    runTypeIdx: index('sandbox_runs_run_type_idx').on(table.runType),
    createdAtIdx: index('sandbox_runs_created_at_idx').on(table.createdAt),
    createdByIdx: index('sandbox_runs_created_by_idx').on(table.createdBy),
  })
)

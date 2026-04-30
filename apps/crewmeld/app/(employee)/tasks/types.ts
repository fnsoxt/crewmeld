import type { SopExecutionStatus, SopNodeStatus, SopPauseStatus } from '@crewmeld/db/schema'

/** SOP execution list item */
export interface SopExecutionListItem {
  id: string
  sopDefinitionId: string
  sopName: string
  sopVersion: number
  status: SopExecutionStatus
  triggeredBy: string
  triggeredByName: string
  /** Current node name (extracted from stateSnapshot) */
  currentNodeName: string | null
  /** Number of completed nodes */
  completedNodes: number
  /** Total number of nodes */
  totalNodes: number
  errorMessage: string | null
  /** i18n metadata for errorMessage — shape: { errorI18nKey?: string; errorI18nParams?: Record<string,string|number> } */
  metadata: Record<string, unknown> | null
  retryCount: number
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

/** SOP node execution record */
export interface SopNodeExecutionEntry {
  id: string
  nodeId: string
  nodeName: string
  nodeType: string
  status: SopNodeStatus
  result: Record<string, unknown> | null
  workflowRunId: string | null
  errorMessage: string | null
  retryCount: number
  exitId: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

/** SOP execution detail */
export interface SopExecutionDetail extends SopExecutionListItem {
  triggerData: Record<string, unknown>
  stateSnapshot: Record<string, unknown>
  rejectionCount: number
  nodeExecutions: SopNodeExecutionEntry[]
}

/** SOP execution list API response */
export interface SopExecutionListResponse {
  success: boolean
  data: SopExecutionListItem[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

/** Tab name */
export type TaskTab = 'running' | 'scheduled' | 'history' | 'sandbox'

/** Scheduled task list item */
export interface ScheduledTaskItem {
  id: string
  name: string
  sopDefinitionId: string
  sopName: string
  cron: string
  timezone: string
  cronDescription: string
  triggerData: Record<string, unknown> | null
  isActive: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string
}

/** Scheduled task list API response */
export interface ScheduledTaskListResponse {
  success: boolean
  data: ScheduledTaskItem[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

/** Scheduled task execution record */
export interface ScheduledTaskRun {
  id: string
  status: SopExecutionStatus
  startedAt: string | null
  completedAt: string | null
  errorMessage: string | null
  createdAt: string
}

/** Sandbox run list item */
export interface SandboxRunListItem {
  id: string
  runType: 'sop_run'
  status: string
  workflowId: string | null
  sopDefinitionId: string | null
  targetNodeId: string | null
  triggerData: Record<string, unknown>
  policy: Record<string, unknown>
  nodeResults: SandboxRunNodeResult[]
  interceptedCalls: SandboxRunInterceptedCall[]
  executionPath: string[]
  errorMessage: string | null
  totalDurationMs: number | null
  totalTokensUsed: number | null
  createdBy: string
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SandboxRunNodeResult {
  nodeId: string
  nodeName: string
  blockType: string
  status: string
  durationMs: number
  error?: string
  intercepted: boolean
  simulated: boolean
}

export interface SandboxRunInterceptedCall {
  type: string
  channel: string
  target: string
  content: string
  nodeId: string
  timestamp: string
}

/** Sandbox run list API response */
export interface SandboxRunListResponse {
  success: boolean
  data: SandboxRunListItem[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

/** Node work log entry */
export interface NodeLogEntry {
  id: string
  taskId: string
  logType: 'action' | 'tool_call' | 'llm_call' | 'error' | 'decision'
  content: string
  metadata: Record<string, unknown>
  createdAt: string
}

/** Approval info */
export interface ApprovalInfo {
  id: string
  nodeId: string
  status: string
  decision: string | null
  decidedBy: string | null
  comment: string | null
  createdAt: string
}

/** Log query response */
export interface LogsResponse {
  success: boolean
  data: {
    logs: NodeLogEntry[]
    approvals?: ApprovalInfo[]
  }
}

/** Filter state */
export interface TaskFilterState {
  status: string[]
  sopId: string
  dateFrom: string
  dateTo: string
}

/** Pending approval list item */
export interface PendingApprovalItem {
  pauseId: string
  executionId: string
  sopDefinitionId: string
  sopName: string
  nodeId: string
  nodeName: string
  pauseStatus: SopPauseStatus
  assigneeId: string | null
  expiresAt: string | null
  createdAt: string
  /** Waiting duration (milliseconds) */
  waitingDurationMs: number
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical'
}

/** Urgency level config */
export interface UrgencyConfig {
  color: string
  bgColor: string
  text: string
}

/** Approval request */
export interface ApproveRequest {
  comment: string
}

/** Rejection request */
export interface RejectRequest {
  comment: string
}

/** Review action response */
export interface ReviewActionResponse {
  success: boolean
  data?: {
    pauseId: string
    decision: 'approved' | 'rejected'
    decidedBy: string
    decidedAt: string
  }
  error?: string
}

/** Pending approval count response */
export interface PendingCountResponse {
  success: boolean
  data: {
    count: number
  }
}

/** Urgency thresholds (in minutes) */
export const URGENCY_THRESHOLDS = {
  critical: 120,
  high: 60,
  medium: 30,
  low: 0,
} as const

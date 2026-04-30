/**
 * Sandbox type definitions — used by the sandbox store for dry-run / preview
 * execution mode.
 */

/**
 * External call policy — controls which side-effects are allowed during
 * a sandbox dry run. `false` means the engine should intercept (capture
 * the would-be call as preview) instead of executing it for real.
 */
export interface ExternalCallPolicy {
  llm: boolean
  sql: boolean
  push: boolean
  email: boolean
  http: boolean
}

/** Default policy — read-only side effects allowed, notifications intercepted. */
export const DEFAULT_EXTERNAL_CALL_POLICY: ExternalCallPolicy = {
  llm: true,
  sql: true,
  push: false,
  email: false,
  http: true,
}

/** The result of executing a single node in sandbox mode. */
export interface SandboxNodeResult {
  nodeId: string
  blockId?: string
  blockType?: string
  blockName?: string
  status: 'success' | 'error' | 'skipped'
  startedAt?: string
  endedAt?: string
  durationMs?: number
  output?: unknown
  error?: string
  /** Whether the node call was intercepted rather than executed. */
  intercepted?: boolean
  /** Preview of the intercepted call content. */
  preview?: string
}

/** An intercepted external call captured during sandbox execution. */
export interface InterceptedCall {
  id?: string
  type: 'push' | 'pull' | 'http' | 'tool'
  blockId?: string
  nodeId?: string
  service?: string
  method?: string
  url?: string
  requestBody?: unknown
  responseBody?: unknown
  timestamp: string
  /** Channel name for push-type calls. */
  channel?: string
  /** Target for the intercepted call. */
  target?: string
  /** Content preview for the intercepted call. */
  content?: string
}

/** SSE event types emitted during sandbox execution streaming. */
export type SandboxSSEEventType =
  | 'sandbox:started'
  | 'sandbox:block:started'
  | 'sandbox:block:completed'
  | 'sandbox:block:error'
  | 'sandbox:block:intercepted'
  | 'sandbox:waiting_for_input'
  | 'sandbox:completed'
  | 'sandbox:error'
  | 'sandbox:cancelled'
  | 'node_start'
  | 'node_complete'
  | 'node_error'
  | 'intercept'
  | 'done'
  | 'error'

/** A single SSE event from the sandbox execution stream. */
export interface SandboxSSEEvent {
  type: SandboxSSEEventType
  /** Sandbox run ID this event belongs to. */
  runId?: string
  /** ISO timestamp of the event. */
  timestamp: string
  data: Record<string, unknown>
}

/**
 * Consolidated execution types — relocated from executor/ stubs.
 * These types are shared across providers, logs, stores, and uploads.
 *
 * The DAG executor has been removed from CrewMeld. These types are retained
 * for data-shape compatibility across the logging, provider, and upload layers.
 */

// ---------------------------------------------------------------------------
// File types
// ---------------------------------------------------------------------------

export interface UserFile {
  id: string
  name: string
  url: string
  size: number
  type: string
  key: string
  context?: string
  base64?: string
}

// ---------------------------------------------------------------------------
// Provider timing / cost
// ---------------------------------------------------------------------------

/** Provider timing segments reported per execution phase. */
export interface ProviderTimingSegment {
  type: string
  name?: string
  startTime: string | number
  endTime: string | number
  duration: number
}

/** Timing breakdown reported by a provider for a single execution. */
export interface ProviderTiming {
  startTime: string
  endTime: string
  duration: number
  modelTime?: number
  toolsTime?: number
  firstResponseTime?: number
  iterations?: number
  timeSegments?: ProviderTimingSegment[]
}

/** Cost breakdown reported by a provider. */
export interface ProviderCost {
  input: number
  output: number
  total: number
  pricing?: { input: number; output: number; updatedAt: string }
}

// ---------------------------------------------------------------------------
// Block / execution output shapes
// ---------------------------------------------------------------------------

/** Normalized output from a block / provider execution. */
export interface NormalizedBlockOutput {
  response?: string
  content?: string
  model?: string
  error?: string
  tokens?: { input: number; output: number; total: number }
  toolCalls?: { list: unknown[]; count: number } | null
  toolResults?: unknown[]
  providerTiming?: ProviderTiming
  cost?: ProviderCost
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

/** Log entry for a single block execution. */
export interface BlockLog {
  blockId: string
  blockName: string
  blockType: string
  success: boolean
  /** ISO timestamp when the block started. */
  startedAt: string
  /** ISO timestamp when the block ended. */
  endedAt: string
  /** Legacy aliases kept for compatibility. */
  startTime?: string
  endTime?: string
  durationMs: number
  input?: Record<string, unknown>
  output?: NormalizedBlockOutput
  error?: string
  /** Whether this block's error was handled by an error-handler path. */
  errorHandled?: boolean
  tokens?: { input?: number; output?: number; total?: number }
  cost?: { total?: number; input?: number; output?: number }
  /** Loop container ID this block belongs to. */
  loopId?: string
  /** Parallel container ID this block belongs to. */
  parallelId?: string
  /** Current iteration index within a loop/parallel. */
  iterationIndex?: number
  /** Child trace spans for nested workflow blocks. */
  childTraceSpans?: unknown[]
}

/** Execution result returned by the executor. */
export interface ExecutionResult {
  success: boolean
  /** Always present on a completed result. */
  output: NormalizedBlockOutput
  error?: string
  logs?: BlockLog[]
  executionId?: string
  durationMs?: number
  metadata?: Record<string, unknown>
  blocks?: Record<string, unknown>
  /** Whether this result came from a streaming execution. */
  isStreaming?: boolean
}

/** Execution context passed through the DAG run. */
export interface ExecutionContext {
  executionId: string
  workflowId: string
  userId: string
  workspaceId: string
  variables?: Record<string, string>
  metadata?: Record<string, unknown>
}

/** Streaming execution handle returned during streamed runs. */
export interface StreamingExecution {
  /** The readable byte stream of text deltas. */
  stream: ReadableStream<Uint8Array>
  /** The accumulated execution result, updated as the stream progresses. */
  execution: ExecutionResult
}

// ---------------------------------------------------------------------------
// Serializable execution state (snapshot / log layer)
// ---------------------------------------------------------------------------

/** Serializable snapshot of an execution state (all Maps/Sets converted). */
export interface SerializableExecutionState {
  executionId: string
  workflowId?: string
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'
  blockResults: Record<string, unknown>
  context?: Record<string, unknown>
  startedAt?: string
  endedAt?: string
}

/** Metadata passed into an execution to contextualize logging and tracing. */
export interface ExecutionMetadata {
  executionId: string
  workflowId: string
  userId: string
  /** Optional override for the user that owns the session (e.g. oauth actor). */
  sessionUserId?: string
  /** The user ID stored on the workflow record (may differ from the actor userId). */
  workflowUserId?: string
  workspaceId: string
  triggerType?: string
  deploymentVersionId?: string
  requestId?: string
  variables?: Record<string, string>
  /** Whether to execute from draft state rather than the deployed version. */
  useDraftState?: boolean
  /** ISO timestamp when the execution started. */
  startTime?: string
  /** Whether this is a client-side session execution. */
  isClientSession?: boolean
  /** Block ID of the trigger block that initiated execution. */
  triggerBlockId?: string
  /** User ID associated with the credential account (e.g. OAuth actor). */
  credentialAccountUserId?: string
  /** Optional override for the workflow state (used in webhook/scheduled executions). */
  workflowStateOverride?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Executor class stub
// ---------------------------------------------------------------------------

/** Stub executor class — the real DAG executor has been removed from CrewMeld. */
export class Executor {
  async execute(_context: unknown): Promise<unknown> {
    return null
  }
  cancel(): void {}
}

// ---------------------------------------------------------------------------
// ExecutionSnapshot stub
// ---------------------------------------------------------------------------

/** ExecutionSnapshot stub — DAG execution logging removed from CrewMeld. */
export class ExecutionSnapshot {
  static create(_state: unknown): ExecutionSnapshot {
    return new ExecutionSnapshot()
  }
  toJSON(): Record<string, unknown> {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Error utilities
// ---------------------------------------------------------------------------

/** Base class for executor-related errors. */
export class ExecutorError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'EXECUTOR_ERROR'
  ) {
    super(message)
    this.name = 'ExecutorError'
  }
}

/** Thrown when a block execution fails. */
export class BlockExecutionError extends ExecutorError {
  constructor(
    message: string,
    public readonly blockId: string,
    public readonly blockType?: string
  ) {
    super(message, 'BLOCK_EXECUTION_ERROR')
    this.name = 'BlockExecutionError'
  }
}

/** Thrown when an execution is cancelled by the user or system. */
export class ExecutionCancelledError extends ExecutorError {
  constructor(message = 'Execution was cancelled') {
    super(message, 'EXECUTION_CANCELLED')
    this.name = 'ExecutionCancelledError'
  }
}

/** Returns true when the error is an ExecutorError. */
export function isExecutorError(err: unknown): err is ExecutorError {
  return err instanceof ExecutorError
}

/** Returns true when the error is an ExecutionCancelledError. */
export function isExecutionCancelledError(err: unknown): err is ExecutionCancelledError {
  return err instanceof ExecutionCancelledError
}

/** An error that carries a partial execution result (e.g. mid-run failure). */
export interface ErrorWithExecutionResult {
  executionResult: ExecutionResult
}

/** Returns true when the error carries an embedded execution result. */
export function hasExecutionResult(err: unknown): err is ErrorWithExecutionResult {
  return (
    typeof err === 'object' &&
    err !== null &&
    'executionResult' in err &&
    typeof (err as ErrorWithExecutionResult).executionResult === 'object'
  )
}

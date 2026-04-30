/**
 * Execution event types — relocated from lib/workflows/executor/execution-events.ts stub.
 * Used by the SOP engine, event buffer, and execution stream.
 */

export type ExecutionEventType =
  | 'execution:started'
  | 'execution:completed'
  | 'execution:error'
  | 'execution:cancelled'
  | 'block:started'
  | 'block:completed'
  | 'block:error'
  | 'stream:chunk'
  | 'stream:done'
  | 'sop:started'
  | 'sop:node:started'
  | 'sop:node:completed'
  | 'sop:node:error'
  | 'sop:paused'
  | 'sop:resumed'
  | 'sop:completed'
  | 'sop:error'
  | 'sop:timed_out'
  | 'sop:cancelled'
  | 'sop:workflow:started'
  | 'sop:workflow:completed'

export interface BaseExecutionEvent {
  type: ExecutionEventType
  timestamp: string
  executionId: string
  /** Event payload — shape depends on event type. */
  data?: Record<string, unknown>
}

export interface SopExecutionEvent extends BaseExecutionEvent {
  type: Extract<ExecutionEventType, `sop:${string}`>
  nodeId?: string
  data?: Record<string, unknown>
}

/** Typed discriminated union for strongly-typed event handling. */
export type ExecutionEvent =
  | ({ type: 'execution:started'; data?: ExecutionStartedData } & Omit<
      BaseExecutionEvent,
      'type' | 'data'
    >)
  | ({ type: 'execution:completed'; data?: ExecutionCompletedData } & Omit<
      BaseExecutionEvent,
      'type' | 'data'
    >)
  | ({ type: 'execution:error'; data?: ExecutionErrorData } & Omit<
      BaseExecutionEvent,
      'type' | 'data'
    >)
  | ({ type: 'execution:cancelled'; data?: ExecutionCancelledData } & Omit<
      BaseExecutionEvent,
      'type' | 'data'
    >)
  | ({ type: 'block:started'; data?: BlockStartedData } & Omit<BaseExecutionEvent, 'type' | 'data'>)
  | ({ type: 'block:completed'; data?: BlockCompletedData } & Omit<
      BaseExecutionEvent,
      'type' | 'data'
    >)
  | ({ type: 'block:error'; data?: BlockErrorData } & Omit<BaseExecutionEvent, 'type' | 'data'>)
  | ({ type: 'stream:chunk'; data?: StreamChunkData } & Omit<BaseExecutionEvent, 'type' | 'data'>)
  | ({ type: 'stream:done'; data?: StreamDoneData } & Omit<BaseExecutionEvent, 'type' | 'data'>)
  | SopExecutionEvent

/** Data payload for execution:started event. */
export interface ExecutionStartedData {
  workflowId: string
  userId?: string
  variables?: Record<string, string>
}

/** Data payload for execution:completed event. */
export interface ExecutionCompletedData {
  output?: unknown
  durationMs?: number
  cost?: { total?: number }
}

/** Data payload for execution:error event. */
export interface ExecutionErrorData {
  error: string
  blockId?: string
  blockType?: string
  duration?: number
}

/** Data payload for execution:cancelled event. */
export interface ExecutionCancelledData {
  reason?: string
}

/** Data payload for block:started event. */
export interface BlockStartedData {
  blockId: string
  blockType: string
  blockName: string
  input?: Record<string, unknown>
}

/** Data payload for block:completed event. */
export interface BlockCompletedData {
  blockId: string
  blockType: string
  blockName: string
  output?: unknown
  durationMs?: number
}

/** Data payload for block:error event. */
export interface BlockErrorData {
  blockId: string
  blockType: string
  blockName: string
  error: string
}

/** Data payload for stream:chunk event. */
export interface StreamChunkData {
  blockId: string
  chunk: string
}

/** Data payload for stream:done event. */
export interface StreamDoneData {
  blockId: string
  content: string
}

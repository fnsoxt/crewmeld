/**
 * Execution event-buffer stub — P1 placeholder.
 * Full Redis-backed implementation will be ported in a later wave.
 */

import type { ExecutionEvent } from '@/lib/types/execution-events'

export type ExecutionStreamStatus = 'active' | 'complete' | 'error' | 'cancelled' | 'timed_out'

export interface ExecutionStreamMeta {
  status: ExecutionStreamStatus
  userId?: string
  workflowId?: string
  updatedAt?: string
}

export interface ExecutionEventEntry {
  eventId: number
  executionId: string
  event: ExecutionEvent
}

export interface ExecutionEventWriter {
  write: (event: ExecutionEvent) => Promise<void>
  flush: () => Promise<void>
  close: () => Promise<void>
}

export function createExecutionEventWriter(_executionId: string): ExecutionEventWriter {
  return {
    write: async (_event: ExecutionEvent) => {},
    flush: async () => {},
    close: async () => {},
  }
}

export async function setExecutionMeta(
  _executionId: string,
  _meta: Partial<ExecutionStreamMeta>
): Promise<void> {}

export async function getExecutionMeta(_executionId: string): Promise<ExecutionStreamMeta | null> {
  return null
}

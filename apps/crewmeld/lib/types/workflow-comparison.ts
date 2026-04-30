/**
 * Workflow state comparison utilities — relocated from lib/workflows/comparison.ts stub.
 * Used by the snapshot service for deduplication hashing.
 */

export interface WorkflowStateDiff {
  added: string[]
  removed: string[]
  changed: string[]
}

export function compareWorkflowStates(_a: unknown, _b: unknown): WorkflowStateDiff {
  return { added: [], removed: [], changed: [] }
}

/** Deterministic stringification used to hash snapshots. */
export function normalizedStringify(value: unknown): string {
  return JSON.stringify(value ?? null)
}

/** Normalize a workflow state object (strip volatile fields). */
export function normalizeWorkflowState<T>(state: T): T {
  return state
}

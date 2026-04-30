/**
 * Workflow state type stubs — the workflow canvas (blocks/editor) has been removed
 * from CrewMeld. These types are retained because back-end services (logs, undo-redo,
 * socket layer) still reference them for data-shape compatibility.
 */

/** Represents a single sub-block (field) inside a workflow block. */
export interface SubBlockState {
  id: string
  type: string
  value: unknown
}

/** Position on the canvas. */
export interface Position {
  x: number
  y: number
}

/** A workflow block node as persisted in the workflow state. */
export interface BlockState {
  id: string
  type: string
  name: string
  position: Position
  parentId?: string
  enabled?: boolean
  locked?: boolean
  handles?: boolean
  subBlocks: Record<string, SubBlockState>
  outputs: Record<string, unknown>
  data?: Record<string, unknown>
  /** Trigger mode for trigger-type blocks. */
  triggerMode?: string
}

/** A loop container definition. */
export interface Loop {
  id: string
  nodes: string[]
  iterations?: number
}

/** A parallel container definition. */
export interface Parallel {
  id: string
  nodes: string[]
}

/** Discriminates which type of container a block belongs to. */
export type SubflowType = 'loop' | 'parallel'

/** Full workflow state as stored in persistence. */
export interface WorkflowState {
  blocks: Record<string, BlockState>
  edges: unknown[]
  loops?: Record<string, Loop>
  parallels?: Record<string, Parallel>
  variables?: Record<string, unknown>
  /** Optional workflow-level metadata (name, description, etc.). */
  metadata?: Record<string, unknown> & { name?: string }
}

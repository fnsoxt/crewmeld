/**
 * AI workflow generation type definitions — used by the generation store
 * for streaming DAG-generation SSE events.
 */

/** A node in a generated DAG (directed acyclic graph). */
export interface GeneratedDAGNode {
  id: string
  type: string
  name: string
  config?: Record<string, unknown>
  position?: { x: number; y: number }
}

/** An edge connecting two nodes in a generated DAG. */
export interface GeneratedDAGEdge {
  id: string
  source: string
  target: string
}

/** A complete generated workflow DAG. */
export interface GeneratedDAG {
  nodes: GeneratedDAGNode[]
  edges: GeneratedDAGEdge[]
  metadata?: Record<string, unknown>
}

/** Quality metrics for a generated DAG. */
export interface QualityReport {
  score: number
  issues: string[]
  suggestions: string[]
}

/** SSE event types emitted during streaming DAG generation. */
export type GenerationSSEEventType =
  | 'progress'
  | 'quality'
  | 'complete'
  | 'quality_report'
  | 'dag_complete'
  | 'error'
  | 'done'

/** A single SSE event payload from the generation stream. */
export interface GenerationSSEEvent {
  type: GenerationSSEEventType
  /** Progress percentage (0-100) for 'progress' events. */
  progress?: number
  /** Human-readable progress message. */
  message?: string
  /** Quality report for 'quality' events. */
  quality?: QualityReport
  /** Completion result for 'complete' events. */
  result?: {
    dag?: GeneratedDAG
    quality?: QualityReport
  }
  /** Error message for 'error' events. */
  error?: string
}

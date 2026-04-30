/**
 * Timing and cost types for tracking provider round-trip performance.
 */

import type { ModelPricing } from './pricing'

/** One contiguous model or tool-execution span within a completion run. */
export interface TimeSegment {
  type: 'model' | 'tool'
  name: string
  startTime: number
  endTime: number
  duration: number
}

/** Detailed timing breakdown for a single provider round-trip. */
export interface CompletionTiming {
  startTime: string
  endTime: string
  duration: number
  modelTime?: number
  toolsTime?: number
  firstResponseTime?: number
  iterations?: number
  timeSegments?: TimeSegment[]
}

/** Cost attribution computed after a provider call. All amounts in USD. */
export interface CompletionCost {
  input: number
  output: number
  total: number
  pricing: ModelPricing
}

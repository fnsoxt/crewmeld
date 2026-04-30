import type { Content, ToolConfig } from '@google/genai'
import type { FunctionCallResponse, ModelPricing, TimeSegment } from '@/providers/types'

// ── Execution context ──────────────────────────────────────────────────────────

/**
 * Mutable accumulator tracking rolling state across a Gemini tool-use loop.
 * One GeminiCallContext is allocated per top-level executeGeminiRequest call.
 */
export interface GeminiCallContext {
  transcript: Content[]
  tally: { prompt: number; generated: number; combined: number }
  bill: { prompt: number; generated: number; combined: number; rate: ModelPricing }
  invocations: FunctionCallResponse[]
  outputs: Record<string, unknown>[]
  rounds: number
  modelWallMs: number
  toolWallMs: number
  segments: TimeSegment[]
  consumedPins: string[]
  activeCfg: ToolConfig | undefined
}

/**
 * Shape alias expected by any existing callers of ExecutionState.
 * Maps to GeminiCallContext so both names resolve to the same type.
 */
export type ExecutionState = GeminiCallContext

// ── Token usage ───────────────────────────────────────────────────────────────

/**
 * Token counts from Gemini usageMetadata. Re-exported here for convenience;
 * the authoritative definition lives in google/utils.ts.
 */
export interface GeminiUsage {
  promptTokenCount: number
  candidatesTokenCount: number
  totalTokenCount: number
}

// ── Forced-tool check result ───────────────────────────────────────────────────

/**
 * Returned by checkForForcedToolUsage after each tool-call batch.
 */
export interface ForcedToolResult {
  hasUsedForcedTool: boolean
  usedForcedTools: string[]
  nextToolConfig: ToolConfig | undefined
}

// ── Client bootstrap ───────────────────────────────────────────────────────────

/**
 * Parameters consumed by the Google/Vertex client factory.
 * apiKey alone for Google; vertexai + project + location for Vertex AI.
 */
export interface GeminiClientConfig {
  apiKey?: string
  vertexai?: boolean
  project?: string
  location?: string
  accessToken?: string
}

// ── Provider discriminant ──────────────────────────────────────────────────────

/** Identifies whether Google or Vertex AI drives an execution */
export type GeminiProviderType = 'google' | 'vertex'

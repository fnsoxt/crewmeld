import { createLogger } from '@crewmeld/logger'
import {
  type Candidate,
  type Content,
  type FunctionCall,
  FunctionCallingConfigMode,
  type GenerateContentResponse,
  type GenerateContentResponseUsageMetadata,
  type Part,
  type Schema,
  type SchemaUnion,
  ThinkingLevel,
  type ToolConfig,
  Type,
} from '@google/genai'
import type { ProviderRequest } from '@/providers/types'
import { trackForcedToolUsage } from '@/providers/utils'

const log = createLogger('GoogleUtils')

// ── Module-level constants ────────────────────────────────────────────────────

/** Fallback text emitted when a tool message has no response payload */
const EMPTY_TOOL_PAYLOAD = '{}'

/** Maximum number of visible text parts before joining with newline */
const MULTIPART_JOIN_CHAR = '\n'

/** Wrapper key used when coercing non-object tool outputs to Struct shape */
const STRUCT_WRAP_KEY = 'value'

/** Fallback output key when a tool response cannot be JSON-parsed */
const TOOL_OUTPUT_FALLBACK_KEY = 'output'

/** Provider identifier string used in forced-tool tracking calls */
const GOOGLE_PROVIDER_TAG = 'google' as const

/** Role identifier used for model turns in the Gemini Content array */
const GEMINI_MODEL_ROLE = 'model' as const

/** Role identifier used for user turns in the Gemini Content array */
const GEMINI_USER_ROLE = 'user' as const

/** Property key stripped from every schema node before sending to Gemini */
const SCHEMA_BANNED_KEY = 'additionalProperties'

/** Property key removed from individual tool parameter definitions */
const PARAM_DEFAULT_KEY = 'default'

// ── Internal helper types ─────────────────────────────────────────────────────

/** Intermediate representation of one tool parameter property during conversion */
interface PropDescriptor {
  [key: string]: unknown
}

/** Tracks whether a schema node needs recursive cleaning */
type SchemaNode = SchemaUnion

/** Thinking-level label accepted by the public API surface */
type ThinkingLevelLabel = 'minimal' | 'low' | 'medium' | 'high'

/** Lookup table mapping ThinkingLevelLabel to the SDK enum */
const THINKING_LEVEL_MAP: Record<ThinkingLevelLabel, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
}

/** FunctionCallingConfigMode string identifiers accepted from provider configs */
type CallingModeString = 'AUTO' | 'ANY' | 'NONE'

/** Lookup table mapping CallingModeString to the SDK enum */
const CALLING_MODE_MAP: Record<CallingModeString, FunctionCallingConfigMode> = {
  AUTO: FunctionCallingConfigMode.AUTO,
  ANY: FunctionCallingConfigMode.ANY,
  NONE: FunctionCallingConfigMode.NONE,
}

/** Sentinel returned when a system-instruction block has not yet been allocated */
const NO_SYSTEM_BLOCK = undefined

/** Separator inserted between successive system prompt segments */
const SYSTEM_BLOCK_SEPARATOR = '\n'

// ── Schema predicate helpers ──────────────────────────────────────────────────

/** Returns true when a value is a non-null, non-array plain object */
function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

/** Returns true when a schema node is a leaf that needs no further cleaning */
function isLeafSchemaNode(node: SchemaUnion): boolean {
  return node === null || node === undefined || typeof node !== 'object'
}

// ── Usage-metadata field names ────────────────────────────────────────────────

/** SDK field carrying thought/reasoning token count */
const THOUGHTS_TOKEN_FIELD = 'thoughtsTokenCount' as const

/** SDK field carrying tool-use prompt token count */
const TOOL_PROMPT_TOKEN_FIELD = 'toolUsePromptTokenCount' as const

/** SDK field carrying total candidate token count */
const CANDIDATES_TOKEN_FIELD = 'candidatesTokenCount' as const

/** SDK field carrying base prompt token count */
const PROMPT_TOKEN_FIELD = 'promptTokenCount' as const

/** SDK field carrying grand-total token count */
const TOTAL_TOKEN_FIELD = 'totalTokenCount' as const

// ── Stream constants ───────────────────────────────────────────────────────────

/** Initial GeminiUsage value used before any stream chunk is received */
const ZERO_USAGE: GeminiUsage = {
  promptTokenCount: 0,
  candidatesTokenCount: 0,
  totalTokenCount: 0,
}

/** Clones a GeminiUsage record (avoids aliasing the ZERO_USAGE sentinel) */
function cloneUsage(src: GeminiUsage): GeminiUsage {
  return {
    promptTokenCount: src.promptTokenCount,
    candidatesTokenCount: src.candidatesTokenCount,
    totalTokenCount: src.totalTokenCount,
  }
}

// ── Candidate-part predicates ─────────────────────────────────────────────────

/** Returns true when a Part carries visible text (not a thought/reasoning segment) */
function isVisibleTextPart(part: Part): part is Part & { text: string } {
  return Boolean(part.text) && part.thought !== true
}

/** Returns true when a Part carries a function call */
function isFunctionCallPart(part: Part): boolean {
  return Boolean(part.functionCall)
}

/** Coerces an unknown value to a string for error logging */
function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// ── Normalised call adapter ────────────────────────────────────────────────────

/** Shape expected by `trackForcedToolUsage` for each executed call */
interface NormalisedFunctionCall {
  name: string
  arguments: Record<string, unknown>
}

/** Converts a raw SDK FunctionCall into the normalised shape */
function adaptFunctionCall(fc: FunctionCall): NormalisedFunctionCall {
  return {
    name: fc.name ?? '',
    arguments: (fc.args ?? {}) as Record<string, unknown>,
  }
}

/** Fallback description template for tools that omit their own description */
const TOOL_DESCRIPTION_TEMPLATE = (toolId: string): string => `Execute the ${toolId} function`

// ── Struct coercion ───────────────────────────────────────────────────────────

/**
 * Wraps a value in a Struct-compatible object when it is not already one.
 *
 * Gemini's functionResponse.response field maps to google.protobuf.Struct, which
 * requires a plain object with string keys. Primitive values, arrays, and null
 * are wrapped in `{ value: … }` so the API never receives an illegal shape.
 *
 * @param raw - Any value returned by a tool execution
 * @returns A `Record<string, unknown>` safe to embed in a functionResponse
 */
export function ensureStructResponse(raw: unknown): Record<string, unknown> {
  if (isPlainObject(raw)) return raw
  return { [STRUCT_WRAP_KEY]: raw }
}

// ── Token-count types ─────────────────────────────────────────────────────────

/**
 * Normalised token counts extracted from a Gemini usageMetadata block.
 * Field names match the Gemini SDK's UsageMetadata shape.
 */
export interface GeminiUsage {
  promptTokenCount: number
  candidatesTokenCount: number
  totalTokenCount: number
}

// ── Function-call shapes ──────────────────────────────────────────────────────

/**
 * Resolved function call extracted from a Gemini response candidate.
 * Used to normalise the SDK's Part.functionCall before dispatch.
 */
export interface ParsedFunctionCall {
  name: string
  args: Record<string, unknown>
}

// ── Schema cleaning ───────────────────────────────────────────────────────────

/**
 * Recursively strips `additionalProperties` from a JSON-schema tree.
 * Gemini rejects schemas that include this keyword.
 *
 * @param schema - The raw schema to clean
 * @returns A new schema object without `additionalProperties` at any depth
 */
export function cleanSchemaForGemini(schema: SchemaUnion): SchemaUnion {
  if (isLeafSchemaNode(schema)) return schema
  if (Array.isArray(schema)) return schema.map((item) => cleanSchemaForGemini(item as SchemaNode))

  const scrubbed: Record<string, unknown> = {}
  for (const key of Object.keys(schema as Record<string, unknown>)) {
    if (key === SCHEMA_BANNED_KEY) continue
    scrubbed[key] = cleanSchemaForGemini((schema as Record<string, unknown>)[key] as SchemaNode)
  }
  return scrubbed
}

// ── Text extraction ───────────────────────────────────────────────────────────

/**
 * Assembles the visible text output from a Gemini response candidate.
 *
 * Thought parts (model reasoning / chain-of-thought) are excluded — only
 * parts where `thought !== true` and `text` is non-empty are included.
 *
 * @param candidate - The first candidate from a GenerateContentResponse
 * @returns Concatenated text, or an empty string if none is present
 */
export function extractTextContent(candidate: Candidate | undefined): string {
  if (!candidate?.content?.parts) return ''

  const visibleParts = candidate.content.parts.filter(isVisibleTextPart)

  if (visibleParts.length === 0) return ''
  if (visibleParts.length === 1) return visibleParts[0].text
  return visibleParts.map((p) => p.text).join(MULTIPART_JOIN_CHAR)
}

// ── Function-call extraction ──────────────────────────────────────────────────

/**
 * Extracts the first function call found in a candidate's parts.
 *
 * @param candidate - The response candidate to inspect
 * @returns The parsed function call, or null if none is present
 */
export function extractFunctionCall(candidate: Candidate | undefined): ParsedFunctionCall | null {
  if (!candidate?.content?.parts) return null

  for (const part of candidate.content.parts) {
    if (part.functionCall) {
      return {
        name: part.functionCall.name ?? '',
        args: (part.functionCall.args ?? {}) as Record<string, unknown>,
      }
    }
  }
  return null
}

/**
 * Extracts the raw Part that contains the first function call.
 * Preserves fields like `thoughtSignature` that are needed by the SDK.
 *
 * @deprecated Prefer `extractAllFunctionCallParts` for multi-tool handling.
 * @param candidate - The response candidate to inspect
 * @returns The Part, or null if no function call is found
 */
export function extractFunctionCallPart(candidate: Candidate | undefined): Part | null {
  if (!candidate?.content?.parts) return null

  for (const part of candidate.content.parts) {
    if (part.functionCall) return part
  }
  return null
}

/**
 * Extracts every Part that contains a function call from a single candidate.
 *
 * Gemini may return multiple function calls in one response. All of them must
 * be executed before the next model turn begins.
 *
 * @param candidate - The response candidate to inspect
 * @returns All Parts that carry a functionCall (may be empty)
 */
export function extractAllFunctionCallParts(candidate: Candidate | undefined): Part[] {
  if (!candidate?.content?.parts) return []
  return candidate.content.parts.filter(isFunctionCallPart)
}

// ── Usage metadata conversion ─────────────────────────────────────────────────

/**
 * Converts raw Gemini usageMetadata into a normalised GeminiUsage record.
 *
 * Billing notes from the Gemini docs:
 * - `toolUsePromptTokenCount` is charged as input → added to promptTokenCount
 * - `thoughtsTokenCount` (chain-of-thought) is charged as output → added to candidatesTokenCount
 *
 * @param usageMetadata - The usageMetadata block from a GenerateContentResponse
 * @returns Normalised token counts ready for cost calculation
 */
export function convertUsageMetadata(
  usageMetadata: GenerateContentResponseUsageMetadata | undefined
): GeminiUsage {
  const meta = usageMetadata as Record<string, number> | undefined
  const thoughtTokens = meta?.[THOUGHTS_TOKEN_FIELD] ?? 0
  const toolPromptTokens = meta?.[TOOL_PROMPT_TOKEN_FIELD] ?? 0
  const promptTokenCount = (meta?.[PROMPT_TOKEN_FIELD] ?? 0) + toolPromptTokens
  const candidatesTokenCount = (meta?.[CANDIDATES_TOKEN_FIELD] ?? 0) + thoughtTokens
  return {
    promptTokenCount,
    candidatesTokenCount,
    totalTokenCount: meta?.[TOTAL_TOKEN_FIELD] ?? 0,
  }
}

// ── Tool definition shape ─────────────────────────────────────────────────────

/**
 * Minimal tool descriptor expected by the Gemini SDK's `functionDeclarations` list.
 */
export interface GeminiToolDef {
  name: string
  description: string
  parameters: Schema
}

// ── Request format conversion ─────────────────────────────────────────────────

/** Result returned by `convertToGeminiFormat` */
interface GeminiFormatResult {
  contents: Content[]
  tools: GeminiToolDef[] | undefined
  systemInstruction: Content | undefined
}

/**
 * Converts a CrewMeld `ProviderRequest` into the shape expected by the Gemini SDK.
 *
 * Responsibilities:
 * - Builds a `Content[]` history from `messages` and `context`
 * - Lifts system messages into a `systemInstruction` block
 * - Converts tool definitions into `GeminiToolDef[]` with cleaned schemas
 *
 * @param request - The normalised provider request
 * @returns Gemini-shaped contents, tool declarations, and optional system instruction
 */
export function convertToGeminiFormat(request: ProviderRequest): GeminiFormatResult {
  const history: Content[] = []
  let sysBlock: Content | typeof NO_SYSTEM_BLOCK = NO_SYSTEM_BLOCK

  if (request.systemPrompt) {
    sysBlock = { parts: [{ text: request.systemPrompt }] }
  }

  if (request.context) {
    history.push({ role: 'user', parts: [{ text: request.context }] })
  }

  for (const msg of request.messages ?? []) {
    if (msg.role === 'system') {
      if (!sysBlock) {
        sysBlock = { parts: [{ text: msg.content ?? '' }] }
      } else if (sysBlock.parts?.[0] && 'text' in sysBlock.parts[0]) {
        sysBlock.parts[0].text = `${sysBlock.parts[0].text}\n${msg.content}`
      }
      continue
    }

    if (msg.role === 'user' || msg.role === 'assistant') {
      const geminiRole = msg.role === 'user' ? GEMINI_USER_ROLE : GEMINI_MODEL_ROLE

      if (msg.content) {
        history.push({ role: geminiRole, parts: [{ text: msg.content }] })
      }

      if (msg.role === 'assistant' && msg.tool_calls?.length) {
        const fcParts = msg.tool_calls.map((tc) => ({
          functionCall: {
            name: tc.function?.name,
            args: JSON.parse(tc.function?.arguments || EMPTY_TOOL_PAYLOAD) as Record<
              string,
              unknown
            >,
          },
        }))
        history.push({ role: GEMINI_MODEL_ROLE, parts: fcParts })
      }
      continue
    }

    if (msg.role === 'tool') {
      if (!msg.name) {
        log.warn('Tool message missing function name, skipping')
        continue
      }
      let responsePayload: Record<string, unknown>
      try {
        responsePayload = ensureStructResponse(JSON.parse(msg.content ?? EMPTY_TOOL_PAYLOAD))
      } catch {
        responsePayload = { [TOOL_OUTPUT_FALLBACK_KEY]: msg.content }
      }
      history.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: msg.tool_call_id,
              name: msg.name,
              response: responsePayload,
            },
          },
        ],
      })
    }
  }

  const toolDecls = request.tools?.map((tool): GeminiToolDef => {
    const rawParams = { ...(tool.parameters ?? {}) }

    if (rawParams.properties) {
      const props = { ...rawParams.properties }
      const requiredKeys = rawParams.required ? [...rawParams.required] : []

      for (const key of Object.keys(props)) {
        const prop = props[key] as PropDescriptor
        if (PARAM_DEFAULT_KEY in prop) {
          const { [PARAM_DEFAULT_KEY]: _stripped, ...remainder } = prop
          props[key] = remainder
        }
      }

      const cleaned: Schema = {
        type: (rawParams.type as Schema['type']) || Type.OBJECT,
        properties: props as Record<string, Schema>,
        ...(requiredKeys.length > 0 ? { required: requiredKeys } : {}),
      }

      return {
        name: tool.id,
        description: tool.description || TOOL_DESCRIPTION_TEMPLATE(tool.id),
        parameters: cleanSchemaForGemini(cleaned) as Schema,
      }
    }

    return {
      name: tool.id,
      description: tool.description || TOOL_DESCRIPTION_TEMPLATE(tool.id),
      parameters: cleanSchemaForGemini(rawParams) as Schema,
    }
  })

  return { contents: history, tools: toolDecls, systemInstruction: sysBlock }
}

// ── Streaming wrapper ─────────────────────────────────────────────────────────

/** Shared UTF-8 encoder used by the Gemini stream wrapper */
const geminiEncoder = new TextEncoder()

/**
 * Wraps an async Gemini streaming generator into a WHATWG `ReadableStream`.
 *
 * Each chunk's `.text` is forwarded as UTF-8 bytes. Usage metadata is
 * accumulated from the last chunk that carries it. The optional `onComplete`
 * callback fires once with the full assembled text and final token counts.
 *
 * @param stream  - The async generator returned by `generateContentStream`
 * @param onComplete - Optional callback invoked after the stream closes
 * @returns A `ReadableStream<Uint8Array>` suitable for HTTP streaming responses
 */
export function createReadableStreamFromGeminiStream(
  stream: AsyncGenerator<GenerateContentResponse>,
  onComplete?: (content: string, usage: GeminiUsage) => void
): ReadableStream<Uint8Array> {
  let assembled = ''
  let lastUsage: GeminiUsage = cloneUsage(ZERO_USAGE)

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (chunk.usageMetadata) {
            lastUsage = convertUsageMetadata(chunk.usageMetadata)
          }
          const fragment = chunk.text
          if (fragment) {
            assembled += fragment
            controller.enqueue(geminiEncoder.encode(fragment))
          }
        }

        onComplete?.(assembled, lastUsage)
        controller.close()
      } catch (streamErr) {
        log.error('Error reading Google Gemini stream', {
          error: describeError(streamErr),
        })
        controller.error(streamErr)
      }
    },
  })
}

// ── Function-calling mode helpers ─────────────────────────────────────────────

/**
 * Resolves a string mode identifier to the corresponding SDK enum value.
 * Falls back to AUTO for any unrecognised input.
 *
 * @param modeStr - One of 'AUTO', 'ANY', or 'NONE'
 * @returns The matching `FunctionCallingConfigMode` enum member
 */
function resolveFunctionCallingMode(modeStr: string): FunctionCallingConfigMode {
  return CALLING_MODE_MAP[modeStr as CallingModeString] ?? FunctionCallingConfigMode.AUTO
}

// ── Thinking level helpers ────────────────────────────────────────────────────

/**
 * Maps a human-readable thinking-level label to the Gemini SDK's `ThinkingLevel` enum.
 * Unrecognised labels default to HIGH.
 *
 * @param label - One of 'minimal', 'low', 'medium', or 'high' (case-insensitive)
 * @returns The matching `ThinkingLevel` enum member
 */
export function mapToThinkingLevel(label: string): ThinkingLevel {
  return THINKING_LEVEL_MAP[label.toLowerCase() as ThinkingLevelLabel] ?? ThinkingLevel.HIGH
}

// ── Forced-tool tracking ──────────────────────────────────────────────────────

/**
 * Result returned by `checkForForcedToolUsage` after each batch of tool calls.
 */
export interface ForcedToolResult {
  hasUsedForcedTool: boolean
  usedForcedTools: string[]
  nextToolConfig: ToolConfig | undefined
}

/**
 * Inspects a set of executed function calls for forced-tool compliance and
 * computes the ToolConfig to use on the next model turn.
 *
 * @param functionCalls   - The function calls that were executed in this batch
 * @param toolConfig      - The ToolConfig that was active when the calls were made
 * @param forcedTools     - Names of tools that must be called before switching to AUTO
 * @param usedForcedTools - Names of forced tools already consumed in earlier batches
 * @returns Updated tracking state, or null if no forced-tool config is active
 */
export function checkForForcedToolUsage(
  functionCalls: FunctionCall[] | undefined,
  toolConfig: ToolConfig | undefined,
  forcedTools: string[],
  usedForcedTools: string[]
): ForcedToolResult | null {
  if (!functionCalls?.length) return null

  const normalisedCalls: NormalisedFunctionCall[] = functionCalls.map(adaptFunctionCall)

  const tracking = trackForcedToolUsage(
    normalisedCalls,
    toolConfig,
    log,
    GOOGLE_PROVIDER_TAG,
    forcedTools,
    usedForcedTools
  )

  if (!tracking) return null

  const derivedCfg: ToolConfig | undefined = tracking.nextToolConfig?.functionCallingConfig?.mode
    ? {
        functionCallingConfig: {
          mode: resolveFunctionCallingMode(tracking.nextToolConfig.functionCallingConfig.mode),
          allowedFunctionNames: tracking.nextToolConfig.functionCallingConfig.allowedFunctionNames,
        },
      }
    : undefined

  return {
    hasUsedForcedTool: tracking.hasUsedForcedTool,
    usedForcedTools: tracking.usedForcedTools,
    nextToolConfig: derivedCfg,
  }
}

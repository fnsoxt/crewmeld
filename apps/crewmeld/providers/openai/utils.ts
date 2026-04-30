import { createLogger } from '@crewmeld/logger'
import type OpenAI from 'openai'
import type { Message } from '@/providers/types'

const log = createLogger('ResponsesUtils')

// ── Public token-count types ───────────────────────────────────────────────────

/**
 * Normalised token counts extracted from an OpenAI Responses API usage block.
 * All fields are guaranteed to be non-negative integers.
 */
export interface ResponsesUsageTokens {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedTokens: number
  reasoningTokens: number
}

// ── Tool-call shape ────────────────────────────────────────────────────────────

/**
 * A single function-call record extracted from a Responses API output item.
 */
export interface ResponsesToolCall {
  id: string
  name: string
  arguments: string
}

// ── Input-item discriminated union ─────────────────────────────────────────────

/**
 * Union of all item shapes accepted by the Responses API `input` array.
 *
 * Three variants:
 * - Chat message (role + content)
 * - Function call (type = 'function_call')
 * - Function call output (type = 'function_call_output')
 */
export type ResponsesInputItem =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string }

// ── Tool definition shape ──────────────────────────────────────────────────────

/**
 * Function tool definition in the format expected by the Responses API.
 */
export interface ResponsesToolDefinition {
  type: 'function'
  name: string
  description?: string
  parameters?: Record<string, unknown>
}

// ── SSE sentinel ───────────────────────────────────────────────────────────────

/** The sentinel value that signals end-of-stream in an OpenAI SSE response */
const SSE_DONE_SENTINEL = '[DONE]'

/** Prefix on SSE lines that carry event-type metadata */
const SSE_EVENT_PREFIX = 'event:'

/** Prefix on SSE lines that carry JSON payload data */
const SSE_DATA_PREFIX = 'data:'

/** Length of the SSE_EVENT_PREFIX string (used for slicing) */
const SSE_EVENT_SLICE_START = SSE_EVENT_PREFIX.length

/** Length of the SSE_DATA_PREFIX string (used for slicing) */
const SSE_DATA_SLICE_START = SSE_DATA_PREFIX.length

/** Maximum bytes of raw SSE payload logged on parse failure */
const SSE_LOG_TRUNCATE_BYTES = 200

/** Delimiter inserted between assembled text fragments when joining */
const TEXT_FRAGMENT_JOINER = ''

// ── Event-type string constants ────────────────────────────────────────────────

const EVT_ERROR = 'response.error'
const EVT_GENERIC_ERROR = 'error'
const EVT_FAILED = 'response.failed'
const EVT_TEXT_DELTA = 'response.output_text.delta'
const EVT_JSON_DELTA = 'response.output_json.delta'
const EVT_COMPLETED = 'response.completed'

// ── Role constants ─────────────────────────────────────────────────────────────

/** Role identifier for assistant turns in Responses API input arrays */
const ASSISTANT_ROLE = 'assistant' as const

/** Role identifier for system turns in Responses API input arrays */
const SYSTEM_ROLE = 'system' as const

/** Role identifier for user turns in Responses API input arrays */
const USER_ROLE = 'user' as const

/** Role identifier for tool-result turns in Responses API input arrays */
const TOOL_ROLE = 'tool' as const

// ── Output-item type tags ──────────────────────────────────────────────────────

/** Responses API output-item type for message payloads */
const ITEM_TYPE_MESSAGE = 'message' as const

/** Responses API output-item type for function-call payloads */
const ITEM_TYPE_FUNCTION_CALL = 'function_call' as const

/** Responses API input-item type for function-call result payloads */
const ITEM_TYPE_FUNCTION_CALL_OUTPUT = 'function_call_output' as const

// ── Message conversion ─────────────────────────────────────────────────────────

/**
 * Converts a CrewMeld message list into the flat input-item array expected
 * by the OpenAI Responses API.
 *
 * Mapping rules:
 * - `tool` messages with a `tool_call_id` → `function_call_output` items
 * - `system`/`user`/`assistant` messages with content → chat-role items
 * - `assistant` messages with `tool_calls` → `function_call` items
 *
 * @param messages - The ordered message list from a ProviderRequest
 * @returns Flat array of Responses API input items
 */
export function buildResponsesInputFromMessages(messages: Message[]): ResponsesInputItem[] {
  const items: ResponsesInputItem[] = []

  for (const msg of messages) {
    if (msg.role === TOOL_ROLE && msg.tool_call_id) {
      items.push({
        type: ITEM_TYPE_FUNCTION_CALL_OUTPUT,
        call_id: msg.tool_call_id,
        output: msg.content ?? '',
      })
      continue
    }

    if (
      msg.content &&
      (msg.role === SYSTEM_ROLE || msg.role === USER_ROLE || msg.role === ASSISTANT_ROLE)
    ) {
      items.push({ role: msg.role, content: msg.content })
    }

    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        items.push({
          type: ITEM_TYPE_FUNCTION_CALL,
          call_id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        })
      }
    }
  }

  return items
}

// ── Tool definition conversion ─────────────────────────────────────────────────

/**
 * Converts a list of generic tool descriptors into the `ResponsesToolDefinition[]`
 * format accepted by the Responses API.
 *
 * Tools missing a resolvable name are silently dropped.
 *
 * @param toolList - Tool descriptors in either Chat Completions or Responses format
 * @returns Responses-API-shaped function declarations
 */
export function convertToolsToResponses(
  toolList: Array<{
    type?: string
    name?: string
    description?: string
    parameters?: Record<string, unknown>
    function?: { name: string; description?: string; parameters?: Record<string, unknown> }
  }>
): ResponsesToolDefinition[] {
  const resolved: ResponsesToolDefinition[] = []

  for (const tool of toolList) {
    const resolvedName = tool.function?.name ?? tool.name
    if (!resolvedName) continue

    resolved.push({
      type: 'function' as const,
      name: resolvedName,
      description: tool.function?.description ?? tool.description,
      parameters: tool.function?.parameters ?? tool.parameters,
    })
  }

  return resolved
}

// ── Tool-choice conversion ─────────────────────────────────────────────────────

/**
 * Converts a provider tool-choice value into the shape accepted by the
 * Responses API (`'auto'`, `'none'`, or `{ type: 'function', name }``).
 *
 * @param toolChoice - The raw tool-choice from a ProviderRequest
 * @returns Responses-API-compatible tool-choice, or undefined for no preference
 */
export function toResponsesToolChoice(
  toolChoice:
    | 'auto'
    | 'none'
    | { type: 'function'; function?: { name: string }; name?: string }
    | { type: 'tool'; name: string }
    | { type: 'any'; any: { model: string; name: string } }
    | undefined
): 'auto' | 'none' | { type: 'function'; name: string } | undefined {
  if (!toolChoice) return undefined
  if (typeof toolChoice === 'string') return toolChoice

  if (toolChoice.type === 'function') {
    const resolvedName = toolChoice.name ?? toolChoice.function?.name
    return resolvedName ? { type: 'function', name: resolvedName } : undefined
  }

  return 'auto'
}

// ── Text extraction helpers ────────────────────────────────────────────────────

/** Supported content-part type tags that carry visible text */
type TextPartType = 'output_text' | 'text'

/**
 * Pulls the visible text out of a single message output item.
 * Handles both string content and structured content-part arrays.
 *
 * @param msgItem - A raw message output item (typed as Record for SDK flexibility)
 * @returns The assembled text string, or empty string if none is found
 */
function pullTextFromOutputItem(msgItem: Record<string, unknown>): string {
  if (!msgItem) return ''
  if (typeof msgItem.content === 'string') return msgItem.content
  if (!Array.isArray(msgItem.content)) return ''

  const fragments: string[] = []
  for (const segment of msgItem.content) {
    if (!segment || typeof segment !== 'object') continue

    const segType = (segment as Record<string, unknown>).type as TextPartType | string | undefined
    const segText = (segment as Record<string, unknown>).text
    const segJson = (segment as Record<string, unknown>).json

    if ((segType === 'output_text' || segType === 'text') && typeof segText === 'string') {
      fragments.push(segText)
      continue
    }

    if (segType === 'output_json') {
      if (typeof segText === 'string') {
        fragments.push(segText)
      } else if (segJson !== undefined) {
        fragments.push(JSON.stringify(segJson))
      }
    }
  }

  return fragments.join('')
}

// ── Public text extractor ──────────────────────────────────────────────────────

/**
 * Assembles the full text response from a Responses API output-item array.
 * Only items of type `'message'` are inspected; all others are skipped.
 *
 * @param outputItems - The `output` array from a Responses API response
 * @returns Concatenated text content
 */
export function extractResponseText(outputItems: OpenAI.Responses.ResponseOutputItem[]): string {
  if (!Array.isArray(outputItems)) return ''

  const segments: string[] = []
  for (const item of outputItems) {
    if (item?.type !== ITEM_TYPE_MESSAGE) continue
    const fragment = pullTextFromOutputItem(item as unknown as Record<string, unknown>)
    if (fragment) segments.push(fragment)
  }

  return segments.join('')
}

// ── Output-to-input converter ──────────────────────────────────────────────────

/**
 * Converts a Responses API output-item array into input items suitable for
 * the next turn in a multi-turn exchange.
 *
 * Handles:
 * - `message` items → assistant chat message + any nested `tool_calls`
 * - `function_call` items → `function_call` input items
 *
 * @param outputItems - The `output` array from the previous Responses API response
 * @returns Input items for the subsequent API call
 */
export function convertResponseOutputToInputItems(
  outputItems: OpenAI.Responses.ResponseOutputItem[]
): ResponsesInputItem[] {
  if (!Array.isArray(outputItems)) return []

  const converted: ResponsesInputItem[] = []

  for (const item of outputItems) {
    if (!item || typeof item !== 'object') continue

    if (item.type === ITEM_TYPE_MESSAGE) {
      const msgRecord = item as unknown as Record<string, unknown>
      const visibleText = pullTextFromOutputItem(msgRecord)
      if (visibleText) {
        converted.push({ role: ASSISTANT_ROLE, content: visibleText })
      }

      const nestedCalls = Array.isArray(msgRecord.tool_calls) ? msgRecord.tool_calls : []
      for (const rawCall of nestedCalls) {
        const callRecord = rawCall as Record<string, unknown>
        const fnRecord = callRecord.function as Record<string, unknown> | undefined
        const callId = callRecord.id as string | undefined
        const fnName = (fnRecord?.name ?? callRecord.name) as string | undefined
        if (!callId || !fnName) continue

        const serialisedArgs =
          typeof fnRecord?.arguments === 'string'
            ? fnRecord.arguments
            : JSON.stringify(fnRecord?.arguments ?? {})

        converted.push({
          type: ITEM_TYPE_FUNCTION_CALL,
          call_id: callId,
          name: fnName,
          arguments: serialisedArgs,
        })
      }
      continue
    }

    if (item.type === ITEM_TYPE_FUNCTION_CALL) {
      const fc = item as OpenAI.Responses.ResponseFunctionToolCall
      const fcRecord = item as unknown as Record<string, unknown>
      const callId = fc.call_id ?? (fcRecord.id as string | undefined)
      const fnName =
        fc.name ??
        ((fcRecord.function as Record<string, unknown> | undefined)?.name as string | undefined)
      if (!callId || !fnName) continue

      const serialisedArgs =
        typeof fc.arguments === 'string' ? fc.arguments : JSON.stringify(fc.arguments ?? {})

      converted.push({
        type: 'function_call',
        call_id: callId,
        name: fnName,
        arguments: serialisedArgs,
      })
    }
  }

  return converted
}

// ── Tool-call extractor ────────────────────────────────────────────────────────

/**
 * Extracts all function-call records from a Responses API output-item array.
 *
 * Handles both top-level `function_call` items and Chat-Completions-style
 * `tool_calls` nested under `message` items.
 *
 * @param outputItems - The `output` array from a Responses API response
 * @returns Ordered list of extracted tool calls
 */
export function extractResponseToolCalls(
  outputItems: OpenAI.Responses.ResponseOutputItem[]
): ResponsesToolCall[] {
  if (!Array.isArray(outputItems)) return []

  const gathered: ResponsesToolCall[] = []

  for (const item of outputItems) {
    if (!item || typeof item !== 'object') continue

    if (item.type === ITEM_TYPE_FUNCTION_CALL) {
      const fc = item as OpenAI.Responses.ResponseFunctionToolCall
      const fcRecord = item as unknown as Record<string, unknown>
      const callId = fc.call_id ?? (fcRecord.id as string | undefined)
      const fnName =
        fc.name ??
        ((fcRecord.function as Record<string, unknown> | undefined)?.name as string | undefined)
      if (!callId || !fnName) continue

      const serialisedArgs =
        typeof fc.arguments === 'string' ? fc.arguments : JSON.stringify(fc.arguments ?? {})

      gathered.push({ id: callId, name: fnName, arguments: serialisedArgs })
      continue
    }

    if (item.type === ITEM_TYPE_MESSAGE) {
      const msgRecord = item as unknown as Record<string, unknown>
      if (!Array.isArray(msgRecord.tool_calls)) continue

      for (const rawCall of msgRecord.tool_calls) {
        const callRecord = rawCall as Record<string, unknown>
        const fnRecord = callRecord.function as Record<string, unknown> | undefined
        const callId = callRecord.id as string | undefined
        const fnName = (fnRecord?.name ?? callRecord.name) as string | undefined
        if (!callId || !fnName) continue

        const serialisedArgs =
          typeof fnRecord?.arguments === 'string'
            ? fnRecord.arguments
            : JSON.stringify(fnRecord?.arguments ?? {})

        gathered.push({ id: callId, name: fnName, arguments: serialisedArgs })
      }
    }
  }

  return gathered
}

// ── Usage parser ───────────────────────────────────────────────────────────────

/**
 * Converts raw Responses API usage metadata into a normalised token-count record.
 *
 * Billing note: `output_tokens` from the API is expected to already include
 * reasoning tokens. When it is absent or zero, `reasoning_tokens` is used as
 * the completion count to avoid under-reporting.
 *
 * @param usage - The usage block from a Responses API response, or undefined
 * @returns Normalised token counts, or undefined if no usage data is present
 */
export function parseResponsesUsage(
  usage: OpenAI.Responses.ResponseUsage | undefined
): ResponsesUsageTokens | undefined {
  if (!usage) return undefined

  const inputCount = usage.input_tokens ?? 0
  const outputCount = usage.output_tokens ?? 0
  const cachedCount = usage.input_tokens_details?.cached_tokens ?? 0
  const reasoningCount = usage.output_tokens_details?.reasoning_tokens ?? 0
  const completionCount = Math.max(outputCount, reasoningCount)

  return {
    promptTokens: inputCount,
    completionTokens: completionCount,
    totalTokens: inputCount + completionCount,
    cachedTokens: cachedCount,
    reasoningTokens: reasoningCount,
  }
}

// ── SSE stream reader ──────────────────────────────────────────────────────────

/** UTF-8 encoder used to convert text deltas to bytes */
const sseUtf8Encoder = new TextEncoder()

/**
 * Wraps a raw HTTP `Response` carrying a Responses API SSE stream into a
 * WHATWG `ReadableStream<Uint8Array>`.
 *
 * Processes SSE lines, forwards text deltas as UTF-8 bytes, and calls the
 * optional `onComplete` callback once the stream closes with the assembled
 * text and final token counts.
 *
 * @param httpResponse - The raw fetch Response from the Responses API endpoint
 * @param onComplete   - Optional callback fired when streaming finishes
 * @returns A `ReadableStream<Uint8Array>` suitable for HTTP response streaming
 */
export function createReadableStreamFromResponses(
  httpResponse: Response,
  onComplete?: (content: string, usage?: ResponsesUsageTokens) => void
): ReadableStream<Uint8Array> {
  let assembled = ''
  let settledUsage: ResponsesUsageTokens | undefined
  let pendingEventType: string | undefined

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const bodyReader = httpResponse.body?.getReader()
      if (!bodyReader) {
        controller.close()
        return
      }

      const utf8Decoder = new TextDecoder()
      let lineBuffer = ''

      try {
        while (true) {
          const { done, value } = await bodyReader.read()
          if (done) break

          lineBuffer += utf8Decoder.decode(value, { stream: true })
          const rawLines = lineBuffer.split('\n')
          lineBuffer = rawLines.pop() ?? ''

          for (const rawLine of rawLines) {
            const trimmedLine = rawLine.trim()
            if (!trimmedLine) continue

            if (trimmedLine.startsWith(SSE_EVENT_PREFIX)) {
              pendingEventType = trimmedLine.slice(SSE_EVENT_SLICE_START).trim()
              continue
            }

            if (!trimmedLine.startsWith(SSE_DATA_PREFIX)) continue

            const payload = trimmedLine.slice(SSE_DATA_SLICE_START).trim()
            if (payload === SSE_DONE_SENTINEL) continue

            let parsedEvent: Record<string, unknown>
            try {
              parsedEvent = JSON.parse(payload)
            } catch (parseErr) {
              log.debug('Skipping non-JSON response stream chunk', {
                data: payload.slice(0, 200),
                error: parseErr,
              })
              continue
            }

            const resolvedType = parsedEvent?.type ?? pendingEventType

            if (
              resolvedType === EVT_ERROR ||
              resolvedType === EVT_GENERIC_ERROR ||
              resolvedType === EVT_FAILED
            ) {
              const errBlock = parsedEvent.error as Record<string, unknown> | undefined
              const errMsg = (errBlock?.message as string) || 'Responses API stream error'
              controller.error(new Error(errMsg))
              return
            }

            if (resolvedType === EVT_TEXT_DELTA || resolvedType === EVT_JSON_DELTA) {
              let fragment = ''
              const deltaVal = parsedEvent.delta as string | Record<string, unknown> | undefined

              if (typeof deltaVal === 'string') {
                fragment = deltaVal
              } else if (deltaVal && typeof deltaVal.text === 'string') {
                fragment = deltaVal.text
              } else if (deltaVal && (deltaVal as Record<string, unknown>).json !== undefined) {
                fragment = JSON.stringify((deltaVal as Record<string, unknown>).json)
              } else if (parsedEvent.json !== undefined) {
                fragment = JSON.stringify(parsedEvent.json)
              } else if (typeof parsedEvent.text === 'string') {
                fragment = parsedEvent.text
              }

              if (fragment.length > 0) {
                assembled += fragment
                controller.enqueue(sseUtf8Encoder.encode(fragment))
              }
            }

            if (resolvedType === EVT_COMPLETED) {
              const responseBlock = parsedEvent.response as Record<string, unknown> | undefined
              const usageBlock = (responseBlock?.usage ?? parsedEvent.usage) as
                | OpenAI.Responses.ResponseUsage
                | undefined
              settledUsage = parseResponsesUsage(usageBlock)
            }
          }
        }

        onComplete?.(assembled, settledUsage)
        controller.close()
      } catch (streamErr) {
        controller.error(streamErr)
      } finally {
        bodyReader.releaseLock()
      }
    },
  })
}

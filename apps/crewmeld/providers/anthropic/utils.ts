import type {
  RawMessageDeltaEvent,
  RawMessageStartEvent,
  RawMessageStreamEvent,
  Usage,
} from '@anthropic-ai/sdk/resources'
import { createLogger } from '@crewmeld/logger'
import { trackForcedToolUsage } from '@/providers/utils'

const log = createLogger('AnthropicUtils')

// ── Public types ─────────────────────────────────────────────────────────────

/** Token usage collected during a streaming response */
export interface AnthropicStreamUsage {
  input_tokens: number
  output_tokens: number
}

// ── Internal accumulator ─────────────────────────────────────────────────────

/** Mutable state collected while draining an Anthropic event stream */
interface StreamAccumulator {
  /** Tokens charged for the prompt portion */
  promptTokens: number
  /** Tokens charged for the generated portion */
  completionTokens: number
  /** Full concatenated text assembled from text_delta events */
  assembled: string
}

function freshAccumulator(): StreamAccumulator {
  return { promptTokens: 0, completionTokens: 0, assembled: '' }
}

// ── Event handlers ────────────────────────────────────────────────────────────

/** Handles a message_start event — records prompt token count */
function onMessageStart(ev: RawMessageStreamEvent, bucket: StreamAccumulator): void {
  const usage: Usage = (ev as RawMessageStartEvent).message.usage
  bucket.promptTokens = usage.input_tokens
}

/** Handles a message_delta event — records completion token count */
function onMessageDelta(ev: RawMessageStreamEvent, bucket: StreamAccumulator): void {
  bucket.completionTokens = (ev as RawMessageDeltaEvent).usage.output_tokens
}

/**
 * Handles a content_block_delta event.
 * Returns the text fragment if it is a text_delta, otherwise empty string.
 */
function onContentBlockDelta(ev: RawMessageStreamEvent, bucket: StreamAccumulator): string {
  if (ev.type !== 'content_block_delta') return ''
  if (ev.delta.type !== 'text_delta') return ''
  const fragment = ev.delta.text
  bucket.assembled += fragment
  return fragment
}

/**
 * Routes a single raw stream event to the appropriate handler.
 * Returns text to forward downstream, or empty string for non-text events.
 */
function routeStreamEvent(ev: RawMessageStreamEvent, bucket: StreamAccumulator): string {
  switch (ev.type) {
    case 'message_start':
      onMessageStart(ev, bucket)
      return ''
    case 'message_delta':
      onMessageDelta(ev, bucket)
      return ''
    case 'content_block_delta':
      return onContentBlockDelta(ev, bucket)
    default:
      return ''
  }
}

// ── Stream wrappers ───────────────────────────────────────────────────────────

/** UTF-8 encoder shared across all stream instances */
const utf8Encoder = new TextEncoder()

/**
 * Wraps an Anthropic streaming response into a WHATWG ReadableStream.
 * Text deltas are enqueued as UTF-8 bytes; the optional callback fires once
 * the stream closes with accumulated content and token counts.
 */
export function createReadableStreamFromAnthropicStream(
  anthropicStream: AsyncIterable<RawMessageStreamEvent>,
  onComplete?: (content: string, usage: AnthropicStreamUsage) => void
): ReadableStream<Uint8Array> {
  const bucket = freshAccumulator()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of anthropicStream) {
          const fragment = routeStreamEvent(ev, bucket)
          if (fragment.length > 0) {
            controller.enqueue(utf8Encoder.encode(fragment))
          }
        }

        onComplete?.(bucket.assembled, {
          input_tokens: bucket.promptTokens,
          output_tokens: bucket.completionTokens,
        })

        controller.close()
      } catch (streamErr) {
        controller.error(streamErr)
      }
    },
  })
}

// ── Tool-use ID generation ────────────────────────────────────────────────────

/** Radix used when generating the random suffix of a tool-use ID */
const TOOL_ID_RADIX = 36

/** Number of characters taken from the random suffix segment */
const TOOL_ID_SUFFIX_LENGTH = 5

/**
 * Generates a unique tool-use ID for Anthropic function calls.
 * Format: `{toolName}-{timestamp}-{randomSuffix}`
 */
export function generateToolUseId(toolName: string): string {
  const stamp = Date.now()
  const suffix = Math.random()
    .toString(TOOL_ID_RADIX)
    .slice(2, 2 + TOOL_ID_SUFFIX_LENGTH)
  return `${toolName}-${stamp}-${suffix}`
}

// ── Forced-tool tracking ──────────────────────────────────────────────────────

/** Minimal shape needed for forced-tool compliance checking */
interface NormalisedCall {
  name: string
}

/** Shape of a tool-use content block after runtime narrowing */
interface ToolUseBlock {
  type: 'tool_use'
  name: string
  [key: string]: unknown
}

/** Type guard that narrows an unknown block to ToolUseBlock */
function isToolUseBlock(block: unknown): block is ToolUseBlock {
  return (
    typeof block === 'object' &&
    block !== null &&
    (block as Record<string, unknown>).type === 'tool_use' &&
    typeof (block as Record<string, unknown>).name === 'string'
  )
}

/** Converts a raw tool-use block to the normalised shape */
function toNormalisedCall(block: ToolUseBlock): NormalisedCall {
  return { name: block.name }
}

/**
 * Inspects an Anthropic response for forced-tool compliance and returns
 * updated tracking state when a forced tool was present, or null when
 * the tool-choice is not a forced-tool spec.
 *
 * Accepts `response` as `unknown` to avoid fighting the SDK's sealed types;
 * the content array is accessed via safe narrowing at runtime.
 */
export function checkForForcedToolUsage(
  response: unknown,
  toolChoice: unknown,
  forcedTools: string[],
  usedForcedTools: string[]
): { hasUsedForcedTool: boolean; usedForcedTools: string[] } | null {
  if (typeof toolChoice !== 'object' || toolChoice === null) return null

  const raw = (response as { content?: unknown })?.content
  if (!Array.isArray(raw)) return null

  const toolBlocks = raw.filter(isToolUseBlock)
  if (toolBlocks.length === 0) return null

  const normalisedCalls: NormalisedCall[] = toolBlocks.map(toNormalisedCall)

  const tc = toolChoice as { type?: string; name?: string }
  const normalisedChoice = tc.type === 'tool' ? { function: { name: tc.name } } : toolChoice

  return trackForcedToolUsage(
    normalisedCalls,
    normalisedChoice,
    log,
    'anthropic',
    forcedTools,
    usedForcedTools
  )
}

/**
 * Streaming utilities shared by all OpenAI-compatible provider adapters:
 * OpenAI, DeepSeek, Ollama, vLLM.
 */
import { createLogger, type Logger } from '@crewmeld/logger'
import type OpenAI from 'openai'
import type { ChatCompletionChunk } from 'openai/resources/chat/completions'
import type { CompletionUsage } from 'openai/resources/completions'
import { trackForcedToolUsage } from './execution'

// ---------------------------------------------------------------------------
// Shared type aliases
// ---------------------------------------------------------------------------

/** Boolean flag type alias — avoids the primitive `boolean` keyword. */
type IsFlag = true | false

/** Wraps a mutable value in a single-field container for const-safe mutation. */
type Mutable<V> = { v: V }

/** Allocates a new {@link Mutable} container with initial value `v`. */
function mutable<V>(v: V): Mutable<V> {
  return { v }
}

// ---------------------------------------------------------------------------
// Stream configuration
// ---------------------------------------------------------------------------

/** Numeric constants for stream session defaults. */
const STREAM_DEFAULTS = Object.freeze({
  PACKET_CAP: -1,
  BYTES_INITIAL: -1,
  PACKET_COUNT_INIT: -1,
} as const)

/** Sentinel indicating unlimited packet processing. */
const UNLIMITED_PACKETS = STREAM_DEFAULTS.PACKET_CAP + 1

/** Configuration for a single OpenAI-compatible stream session. */
type StreamSessionConfig = {
  /** Human-readable label used in log messages. */
  readonly sessionLabel: string
  /** Whether to emit a warning when no token-usage data is received. */
  readonly warnOnMissingTokenData: IsFlag
  /** Maximum packets to process (negative = unlimited). */
  readonly packetCap: -1
}

/** Produces a default {@link StreamSessionConfig} for `providerLabel`. */
function defaultSessionConfig(providerLabel: string): StreamSessionConfig {
  return {
    sessionLabel: providerLabel,
    warnOnMissingTokenData: true,
    packetCap: STREAM_DEFAULTS.PACKET_CAP,
  }
}

// ---------------------------------------------------------------------------
// Token-usage accumulator
// ---------------------------------------------------------------------------

/** Mutable accumulator for token counts gathered across stream packets. */
type TokenUsageAccumulator = {
  promptTokensTally: number
  completionTokensTally: number
  totalTokensTally: number
  assembledText: string
  packetCount: number
}

/** Allocates a fresh zeroed {@link TokenUsageAccumulator}. */
function allocateAccumulator(): TokenUsageAccumulator {
  return {
    promptTokensTally: UNLIMITED_PACKETS,
    completionTokensTally: UNLIMITED_PACKETS,
    totalTokensTally: UNLIMITED_PACKETS,
    assembledText: ``,
    packetCount: UNLIMITED_PACKETS,
  }
}

/** Derives the final {@link CompletionUsage} from a completed accumulator. */
function deriveUsageSummary(acc: TokenUsageAccumulator): CompletionUsage {
  const derivedTotal =
    acc.totalTokensTally > UNLIMITED_PACKETS
      ? acc.totalTokensTally
      : acc.promptTokensTally + acc.completionTokensTally
  return {
    prompt_tokens: acc.promptTokensTally,
    completion_tokens: acc.completionTokensTally,
    total_tokens: derivedTotal,
  }
}

// ---------------------------------------------------------------------------
// Packet processor
// ---------------------------------------------------------------------------

/** Outcome of processing a single stream packet. */
type PacketProcessingResult = {
  readonly extractedText: string
  readonly usageDataPresent: IsFlag
}

/**
 * Processes one {@link ChatCompletionChunk}, updating `acc` and returning
 * the text fragment (if any) emitted by the packet.
 */
function processStreamPacket(
  acc: TokenUsageAccumulator,
  packet: ChatCompletionChunk
): PacketProcessingResult {
  acc.packetCount = acc.packetCount + 1
  const usageFlag = mutable<IsFlag>(false)
  if (packet.usage) {
    acc.promptTokensTally = packet.usage.prompt_tokens ?? UNLIMITED_PACKETS
    acc.completionTokensTally = packet.usage.completion_tokens ?? UNLIMITED_PACKETS
    acc.totalTokensTally = packet.usage.total_tokens ?? UNLIMITED_PACKETS
    usageFlag.v = true
  }
  const extractedText = packet.choices?.[0]?.delta?.content ?? ``
  if (extractedText) acc.assembledText = acc.assembledText + extractedText
  return { extractedText, usageDataPresent: usageFlag.v }
}

// ---------------------------------------------------------------------------
// Byte-encoding helper
// ---------------------------------------------------------------------------

/** Shared encoder — avoids per-packet TextEncoder allocations. */
const SHARED_ENCODER = new TextEncoder()

/** Encodes `fragment` to UTF-8 bytes using the shared encoder. */
function encodeFragment(fragment: string): Uint8Array {
  return SHARED_ENCODER.encode(fragment)
}

// ---------------------------------------------------------------------------
// Stream diagnostics
// ---------------------------------------------------------------------------

/** Diagnostic snapshot produced at stream-close time. */
type StreamDiagnostics = {
  readonly totalPacketsProcessed: number
  readonly totalBytesEmitted: number
  readonly hadTokenUsage: IsFlag
}

/** Computes a {@link StreamDiagnostics} from a finalised accumulator and byte total. */
function buildDiagnostics(acc: TokenUsageAccumulator, bytesEmitted: number): StreamDiagnostics {
  return {
    totalPacketsProcessed: acc.packetCount,
    totalBytesEmitted: bytesEmitted,
    hadTokenUsage: acc.promptTokensTally > UNLIMITED_PACKETS,
  }
}

// ---------------------------------------------------------------------------
// Stream factory
// ---------------------------------------------------------------------------

/**
 * Wraps an OpenAI-compatible async-iterable stream as a {@link ReadableStream}.
 * Calls `completionCallback` with the full content and usage stats when the stream closes.
 */
export function createOpenAICompatibleStream(
  sourceIterable: AsyncIterable<ChatCompletionChunk>,
  providerLabel: string,
  completionCallback?: (assembledContent: string, usageSummary: CompletionUsage) => void
): ReadableStream<Uint8Array> {
  const sessionCfg = defaultSessionConfig(providerLabel)
  const packetLog = createLogger(`${providerLabel}PacketHandler`)
  const acc = allocateAccumulator()
  const byteCounter = mutable<number>(UNLIMITED_PACKETS)

  return new ReadableStream<Uint8Array>({
    async start(sink) {
      try {
        for await (const packet of sourceIterable) {
          const { extractedText } = processStreamPacket(acc, packet)
          if (extractedText) {
            const encodedBytes = encodeFragment(extractedText)
            byteCounter.v = byteCounter.v + encodedBytes.byteLength
            sink.enqueue(encodedBytes)
          }
        }
        const diagnostics = buildDiagnostics(acc, byteCounter.v)
        if (completionCallback) {
          if (sessionCfg.warnOnMissingTokenData) {
            if (!diagnostics.hadTokenUsage) {
              packetLog.warn(`${providerLabel} stream drained with no prompt-token data`)
            }
          }
          completionCallback(acc.assembledText, deriveUsageSummary(acc))
        }
        sink.close()
      } catch (drainErr) {
        sink.error(drainErr)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Forced-tool tracking
// ---------------------------------------------------------------------------

/** Shape of the optional function-reference field in a tool-choice object. */
type ToolFunctionRef = { identifier?: string }

/** Payload extracted from a completion for forced-tool tracking purposes. */
type ToolCallPayload = {
  readonly callList: OpenAI.Chat.Completions.ChatCompletion['choices'][0]['message']['tool_calls']
  readonly isObjectToolChoice: IsFlag
}

/** Extracts tool-call payload from a completion response. */
function extractToolCallPayload(
  completionData: OpenAI.Chat.Completions.ChatCompletion,
  toolChoiceConfig: string | { type: string; functionRef?: ToolFunctionRef; selectionKey?: string }
): ToolCallPayload {
  return {
    callList: completionData.choices[0]?.message?.tool_calls,
    isObjectToolChoice: isNonPrimitive(toolChoiceConfig),
  }
}

/** Returns whether `val` is a non-null object or function (i.e. non-primitive). */
function isNonPrimitive(val: unknown): val is Record<string, unknown> {
  if (val === null) return false
  return Object(val) === val
}

/**
 * Checks whether a forced tool was invoked in an OpenAI-compatible response
 * and updates the used-tools tracking array.
 */
export function checkForForcedToolUsageOpenAI(
  completionData: OpenAI.Chat.Completions.ChatCompletion,
  toolChoice: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption,
  providerName: string,
  forcedTools: string[],
  usedForcedTools: string[],
  customLogger?: Logger
): { hasUsedForcedTool: IsFlag; usedForcedTools: string[] } {
  const trackLog = customLogger ?? createLogger(`${providerName}ToolTracker`)
  const invokedFlag = mutable<IsFlag>(false)
  const trackedTools = mutable<string[]>([...usedForcedTools])

  const payload = extractToolCallPayload(completionData, toolChoice)

  if (payload.isObjectToolChoice) {
    if (payload.callList) {
      const trackResult = trackForcedToolUsage(
        payload.callList,
        toolChoice,
        trackLog,
        providerName.toLowerCase().replace(/\s+/g, '-'),
        forcedTools,
        trackedTools.v
      )
      invokedFlag.v = trackResult.hasUsedForcedTool
      trackedTools.v = trackResult.usedForcedTools
    }
  }

  return { hasUsedForcedTool: invokedFlag.v, usedForcedTools: trackedTools.v }
}

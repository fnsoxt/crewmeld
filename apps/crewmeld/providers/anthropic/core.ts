import type Anthropic from '@anthropic-ai/sdk'
import { transformJSONSchema } from '@anthropic-ai/sdk/lib/transform-json-schema'
import type { RawMessageStreamEvent } from '@anthropic-ai/sdk/resources/messages/messages'
import type { Logger } from '@crewmeld/logger'
import { executeTool } from '@/lib/tools/execute-custom-skill'
import type { StreamingExecution } from '@/lib/types/execution'
import { MAX_TOOL_ITERATIONS } from '@/providers'
import {
  checkForForcedToolUsage,
  createReadableStreamFromAnthropicStream,
} from '@/providers/anthropic/utils'
import {
  getMaxOutputTokensForModel,
  getThinkingCapability,
  supportsNativeStructuredOutputs,
} from '@/providers/models'
import type { ProviderRequest, ProviderResponse, TimeSegment } from '@/providers/types'
import { ProviderError } from '@/providers/types'
import {
  calculateCost,
  prepareToolExecution,
  prepareToolsWithUsageControl,
} from '@/providers/utils'

// ── Public configuration interface ──────────────────────────────────────────

/**
 * Wiring required to instantiate an Anthropic provider.
 * Shared between the standard Anthropic provider and the Azure variant.
 */
export interface AnthropicProviderConfig {
  /** Provider identifier (e.g., 'anthropic', 'azure-anthropic') */
  providerId: string
  /** Human-readable label for logging and error messages */
  providerLabel: string
  /** Factory that produces a configured Anthropic SDK client */
  createClient: (apiKey: string, useNativeStructuredOutputs: boolean) => Anthropic
  /** Logger instance scoped to this provider */
  logger: Logger
}

// ── Extended payload type ────────────────────────────────────────────────────

/**
 * Extends the SDK's base streaming params with fields not yet in the official
 * type definition: adaptive thinking, output_format, output_config.
 */
interface AnthropicApiPayload extends Omit<Anthropic.Messages.MessageStreamParams, 'thinking'> {
  thinking?: Anthropic.Messages.ThinkingConfigParam | { type: 'adaptive' }
  output_format?: { type: 'json_schema'; schema: Record<string, unknown> }
  output_config?: { effort: string }
}

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Maps thinking level labels to Anthropic extended-thinking budget_tokens values.
 */
const EXTENDED_THINKING_BUDGETS: Readonly<Record<string, number>> = {
  low: 2048,
  medium: 8192,
  high: 32768,
}

/**
 * Anthropic rejects non-streaming creates above this token limit.
 * We transparently stream + collect when the threshold is exceeded.
 */
const STREAM_UPGRADE_THRESHOLD = 21_333

// ── Schema prompt builder ────────────────────────────────────────────────────

/**
 * Produces a system-prompt block that instructs the model to emit a JSON object
 * conforming to `schema`. Used as a fallback when native structured output is
 * not available for the selected model.
 */
function schemaSystemBlock(schema: Record<string, unknown>, label?: string): string {
  return (
    `IMPORTANT: You must respond with a valid JSON object that conforms to the following schema.\n` +
    `Do not include any text before or after the JSON object. Only output the JSON.\n\n` +
    `Schema name: ${label ?? 'response'}\n` +
    `JSON Schema:\n${JSON.stringify(schema, null, 2)}\n\n` +
    `Your response must be valid JSON that exactly matches this schema structure.`
  )
}

// ── Thinking helpers ─────────────────────────────────────────────────────────

/** Returns true when the model supports Opus 4.6 adaptive thinking. */
function isAdaptiveThinkingModel(id: string): boolean {
  const lower = id.toLowerCase()
  return lower.includes('opus-4-6') || lower.includes('opus-4.6')
}

/**
 * Resolves thinking payload fields for the given model and level string.
 * Returns null when the model has no thinking capability or the level is unknown.
 */
function thinkingFieldsFor(
  modelId: string,
  level: string
): {
  thinking: { type: 'enabled'; budget_tokens: number } | { type: 'adaptive' }
  outputConfig?: { effort: string }
} | null {
  const cap = getThinkingCapability(modelId)
  if (!cap?.levels.includes(level)) return null

  if (isAdaptiveThinkingModel(modelId)) {
    return { thinking: { type: 'adaptive' }, outputConfig: { effort: level } }
  }

  const budget = EXTENDED_THINKING_BUDGETS[level]
  return budget ? { thinking: { type: 'enabled', budget_tokens: budget } } : null
}

// ── Message sender ───────────────────────────────────────────────────────────

/**
 * Sends a message to the Anthropic API. When max_tokens exceeds the
 * non-streaming threshold the request is internally upgraded to a stream
 * and the final collected message is returned.
 */
async function dispatch(
  sdk: Anthropic,
  body: AnthropicApiPayload
): Promise<Anthropic.Messages.Message> {
  if (body.max_tokens > STREAM_UPGRADE_THRESHOLD && !body.stream) {
    return sdk.messages.stream(body as Anthropic.Messages.MessageStreamParams).finalMessage()
  }
  return sdk.messages.create(
    body as Anthropic.Messages.MessageCreateParamsNonStreaming
  ) as Promise<Anthropic.Messages.Message>
}

// ── Message conversion ───────────────────────────────────────────────────────

/**
 * Converts the provider-agnostic request into Anthropic message params.
 * Handles function-role and function_call message shapes from earlier turns.
 */
function buildMessageHistory(req: ProviderRequest): {
  history: Anthropic.Messages.MessageParam[]
  systemText: string
} {
  const history: Anthropic.Messages.MessageParam[] = []
  let systemText = req.systemPrompt ?? ''

  if (req.context) {
    history.push({ role: 'user', content: req.context })
  }

  for (const m of req.messages ?? []) {
    if (m.role === 'function') {
      history.push({
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: m.name ?? '', content: m.content ?? undefined },
        ],
      })
    } else if (m.function_call) {
      history.push({
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: `${m.function_call.name}-${Date.now()}`,
            name: m.function_call.name,
            input: JSON.parse(m.function_call.arguments),
          },
        ],
      })
    } else {
      history.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content ? [{ type: 'text', text: m.content }] : [],
      })
    }
  }

  // Anthropic requires at least one message
  if (history.length === 0) {
    history.push({ role: 'user', content: [{ type: 'text', text: systemText || 'Hello' }] })
    systemText = ''
  }

  return { history, systemText }
}

// ── Tool definition conversion ───────────────────────────────────────────────

/** Maps provider tool descriptors to Anthropic SDK tool objects. */
function toSdkTools(req: ProviderRequest): Anthropic.Messages.Tool[] | undefined {
  if (!req.tools?.length) return undefined
  return req.tools.map((t) => ({
    name: t.id,
    description: t.description,
    input_schema: {
      type: 'object' as const,
      properties: t.parameters.properties,
      required: t.parameters.required,
    },
  }))
}

// ── Streaming envelope factory ───────────────────────────────────────────────

interface LoopSummary {
  accTokens: { input: number; output: number; total: number }
  accCost: { input: number; output: number; total: number }
  calls: CallRecord[]
  outputs: unknown[]
  elapsedModel: number
  elapsedTools: number
  firstLatency: number
  rounds: number
  segments: TimeSegment[]
  tail: Anthropic.Messages.MessageParam[]
  finalText: string
}

/**
 * Constructs a mutable StreamingExecution envelope.
 * The caller must assign the `stream` field after construction.
 */
function newStreamEnvelope(
  req: ProviderRequest,
  wallStart: number,
  wallStartISO: string,
  summary?: LoopSummary
): StreamingExecution {
  const now = Date.now()

  return {
    stream: undefined as unknown as ReadableStream<Uint8Array>,
    execution: {
      success: true,
      output: {
        content: '',
        model: req.model,
        tokens: summary?.accTokens ?? { input: 0, output: 0, total: 0 },
        toolCalls:
          summary && summary.calls.length > 0
            ? { list: summary.calls, count: summary.calls.length }
            : undefined,
        toolResults: summary?.outputs,
        providerTiming: {
          startTime: wallStartISO,
          endTime: new Date(now).toISOString(),
          duration: now - wallStart,
          ...(summary
            ? {
                modelTime: summary.elapsedModel,
                toolsTime: summary.elapsedTools,
                firstResponseTime: summary.firstLatency,
                iterations: summary.rounds,
                timeSegments: summary.segments,
              }
            : {
                timeSegments: [
                  {
                    type: 'model',
                    name: 'Streaming response',
                    startTime: wallStart,
                    endTime: now,
                    duration: now - wallStart,
                  },
                ],
              }),
        },
        cost: { input: 0, output: 0, total: 0 },
      },
      logs: [],
      metadata: {
        startTime: wallStartISO,
        endTime: new Date(now).toISOString(),
        duration: now - wallStart,
      },
      isStreaming: true,
    },
  } as StreamingExecution
}

// ── Tool call record ─────────────────────────────────────────────────────────

interface CallRecord {
  name: string
  arguments: Record<string, unknown>
  startTime: string
  endTime: string
  duration: number
  result: unknown
  success: boolean
}

// ── Single tool execution ────────────────────────────────────────────────────

interface ToolRun {
  useId: string
  fnName: string
  fnArgs: Record<string, unknown>
  params: Record<string, unknown>
  outcome: { success: boolean; output: unknown; error?: string }
  t0: number
  t1: number
  elapsed: number
}

async function runOneTool(
  block: Anthropic.Messages.ToolUseBlock,
  req: ProviderRequest,
  log: Logger
): Promise<ToolRun | null> {
  const fnName = block.name
  const fnArgs = block.input as Record<string, unknown>
  const useId = block.id
  const t0 = Date.now()

  const found = req.tools?.find((t) => t.id === fnName)
  if (!found) return null

  try {
    const { toolParams: params, executionParams } = prepareToolExecution(found, fnArgs, req)
    const raw = await executeTool(fnName, executionParams)
    const t1 = Date.now()
    return { useId, fnName, fnArgs, params, outcome: raw, t0, t1, elapsed: t1 - t0 }
  } catch (e) {
    const t1 = Date.now()
    log.error('Tool execution failed:', { error: e, fnName })
    return {
      useId,
      fnName,
      fnArgs,
      params: {},
      outcome: {
        success: false,
        output: undefined,
        error: e instanceof Error ? e.message : 'Tool execution failed',
      },
      t0,
      t1,
      elapsed: t1 - t0,
    }
  }
}

// ── Thinking block filter ────────────────────────────────────────────────────

type ThinkingBlock = Anthropic.Messages.ThinkingBlock | Anthropic.Messages.RedactedThinkingBlock

function pickThinkingBlocks(blocks: Anthropic.Messages.ContentBlock[]): ThinkingBlock[] {
  return blocks.filter(
    (b): b is ThinkingBlock => b.type === 'thinking' || b.type === 'redacted_thinking'
  )
}

// ── Tool-use loop ────────────────────────────────────────────────────────────

/**
 * Executes the Anthropic tool-use loop starting from the first model reply.
 * All tool calls within a single response are executed concurrently.
 * Thinking blocks are preserved in the conversation history per Anthropic docs.
 */
async function iterateTools(
  sdk: Anthropic,
  baseBody: AnthropicApiPayload,
  firstReply: Anthropic.Messages.Message,
  seedHistory: Anthropic.Messages.MessageParam[],
  prepState: ReturnType<typeof prepareToolsWithUsageControl> | null,
  req: ProviderRequest,
  log: Logger,
  callIssuedAt: number
): Promise<LoopSummary> {
  const firstLatency = Date.now() - callIssuedAt

  const accTokens = {
    input: firstReply.usage?.input_tokens ?? 0,
    output: firstReply.usage?.output_tokens ?? 0,
    total: (firstReply.usage?.input_tokens ?? 0) + (firstReply.usage?.output_tokens ?? 0),
  }

  const startCost = calculateCost(req.model, accTokens.input, accTokens.output)
  const accCost = { input: startCost.input, output: startCost.output, total: startCost.total }

  const calls: CallRecord[] = []
  const outputs: unknown[] = []
  const segments: TimeSegment[] = [
    {
      type: 'model',
      name: 'Initial response',
      startTime: callIssuedAt,
      endTime: callIssuedAt + firstLatency,
      duration: firstLatency,
    },
  ]

  const conversation = [...seedHistory]
  const knownForced = prepState?.forcedTools ?? []
  let seenForced: string[] = []
  let forcedWasUsed = false
  let elapsedModel = firstLatency
  let elapsedTools = 0
  let rounds = 0
  let finalText = ''

  const originalChoice = baseBody.tool_choice

  const trackForced = (reply: Anthropic.Messages.Message, choice: unknown) => {
    const chk = checkForForcedToolUsage(reply, choice, knownForced, seenForced)
    if (chk) {
      forcedWasUsed = chk.hasUsedForcedTool
      seenForced = chk.usedForcedTools
    }
  }

  trackForced(firstReply, originalChoice)

  let currentReply = firstReply

  while (rounds < MAX_TOOL_ITERATIONS) {
    const latestText = currentReply.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
    if (latestText) finalText = latestText

    const useBlocks = currentReply.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use'
    )
    if (useBlocks.length === 0) break

    const batchAt = Date.now()
    const settled = await Promise.allSettled(useBlocks.map((b) => runOneTool(b, req, log)))

    const assembledUse: Anthropic.Messages.ToolUseBlockParam[] = []
    const assembledResult: Anthropic.Messages.ToolResultBlockParam[] = []

    for (const s of settled) {
      if (s.status === 'rejected' || !s.value) continue
      const run = s.value

      segments.push({
        type: 'tool',
        name: run.fnName,
        startTime: run.t0,
        endTime: run.t1,
        duration: run.elapsed,
      })

      const payload: unknown = run.outcome.success
        ? run.outcome.output
        : { error: true, message: run.outcome.error ?? 'Tool execution failed', tool: run.fnName }

      if (run.outcome.success) outputs.push(run.outcome.output)

      calls.push({
        name: run.fnName,
        arguments: run.params,
        startTime: new Date(run.t0).toISOString(),
        endTime: new Date(run.t1).toISOString(),
        duration: run.elapsed,
        result: payload,
        success: run.outcome.success,
      })

      assembledUse.push({ type: 'tool_use', id: run.useId, name: run.fnName, input: run.fnArgs })
      assembledResult.push({
        type: 'tool_result',
        tool_use_id: run.useId,
        content: JSON.stringify(payload),
      })
    }

    const thinkBlocks = pickThinkingBlocks(currentReply.content)
    if (assembledUse.length > 0) {
      conversation.push({
        role: 'assistant',
        content: [...thinkBlocks, ...assembledUse] as Anthropic.Messages.ContentBlockParam[],
      })
    }
    if (assembledResult.length > 0) {
      conversation.push({
        role: 'user',
        content: assembledResult as Anthropic.Messages.ContentBlockParam[],
      })
    }

    elapsedTools += Date.now() - batchAt

    const nextBody: AnthropicApiPayload = { ...baseBody, messages: conversation }
    const thinkingActive = !!baseBody.thinking

    if (
      !thinkingActive &&
      typeof originalChoice === 'object' &&
      forcedWasUsed &&
      knownForced.length > 0
    ) {
      const pending = knownForced.filter((fn) => !seenForced.includes(fn))
      if (pending.length > 0) {
        nextBody.tool_choice = { type: 'tool', name: pending[0] }
        log.info(`Forcing next tool: ${pending[0]}`)
      } else {
        nextBody.tool_choice = undefined
        log.info('All forced tools consumed, removing tool_choice')
      }
    } else if (!thinkingActive && forcedWasUsed && typeof originalChoice === 'object') {
      nextBody.tool_choice = undefined
      log.info('Removing tool_choice after forced tool was consumed')
    }

    const modelAt = Date.now()
    currentReply = await dispatch(sdk, nextBody)
    const modelElapsed = Date.now() - modelAt

    segments.push({
      type: 'model',
      name: `Model response (iteration ${rounds + 1})`,
      startTime: modelAt,
      endTime: modelAt + modelElapsed,
      duration: modelElapsed,
    })
    elapsedModel += modelElapsed

    if (currentReply.usage) {
      accTokens.input += currentReply.usage.input_tokens ?? 0
      accTokens.output += currentReply.usage.output_tokens ?? 0
      accTokens.total +=
        (currentReply.usage.input_tokens ?? 0) + (currentReply.usage.output_tokens ?? 0)

      const itCost = calculateCost(
        req.model,
        currentReply.usage.input_tokens ?? 0,
        currentReply.usage.output_tokens ?? 0
      )
      accCost.input += itCost.input
      accCost.output += itCost.output
      accCost.total += itCost.total
    }

    trackForced(currentReply, nextBody.tool_choice)
    rounds++
  }

  // Capture text from final reply
  const endText = currentReply.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  if (endText) finalText = endText

  return {
    accTokens,
    accCost,
    calls,
    outputs,
    elapsedModel,
    elapsedTools,
    firstLatency,
    rounds,
    segments,
    tail: conversation,
    finalText,
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Executes a request against the Anthropic Messages API.
 *
 * Handles:
 * - Streaming (no tools) and non-streaming paths
 * - Silent tool-pass + streaming final response
 * - Extended and adaptive thinking configuration
 * - Native and prompt-injected structured output
 *
 * Used by both the standard Anthropic provider and the Azure Anthropic variant.
 */
export async function executeAnthropicProviderRequest(
  req: ProviderRequest,
  cfg: AnthropicProviderConfig
): Promise<ProviderResponse | StreamingExecution> {
  const { logger: log, providerId, providerLabel } = cfg

  if (!req.apiKey) throw new Error(`API key is required for ${providerLabel}`)

  const modelId = req.model
  const wantNative = !!(req.responseFormat && supportsNativeStructuredOutputs(modelId))
  const sdk = cfg.createClient(req.apiKey, wantNative)

  // Build conversation history
  const { history, systemText } = buildMessageHistory(req)
  const sdkTools = toSdkTools(req)

  // Prepare tools via usage-control pipeline
  let activeTools = sdkTools
  let choiceValue: 'none' | 'auto' | { type: 'tool'; name: string } = 'auto'
  let prepState: ReturnType<typeof prepareToolsWithUsageControl> | null = null

  if (sdkTools?.length) {
    try {
      prepState = prepareToolsWithUsageControl(sdkTools, req.tools, log, providerId)
      const { tools: filtered, toolChoice: tc } = prepState
      if (filtered?.length) {
        activeTools = filtered
        if (typeof tc === 'object' && tc !== null) {
          choiceValue = tc.type === 'tool' ? tc : 'auto'
          if (tc.type !== 'tool') log.warn(`Non-anthropic tool_choice format, using auto`)
        } else if (tc === 'auto' || tc === 'none') {
          choiceValue = tc
        } else {
          choiceValue = 'auto'
          log.warn('Unexpected tool_choice value, using auto')
        }
      }
    } catch (e) {
      log.error('prepareToolsWithUsageControl failed:', { error: e })
      choiceValue = 'auto'
    }
  }

  // Assemble base request body
  const body: AnthropicApiPayload = {
    model: req.model,
    messages: history,
    system: systemText,
    max_tokens: Number.parseInt(String(req.maxTokens)) || getMaxOutputTokensForModel(req.model),
    temperature: Number.parseFloat(String(req.temperature ?? 0.7)),
  }

  // Apply response format (native or prompt-injected)
  if (req.responseFormat) {
    const rawSchema = req.responseFormat.schema ?? req.responseFormat
    if (wantNative) {
      body.output_format = { type: 'json_schema', schema: transformJSONSchema(rawSchema) }
      log.info(`Native structured output for model: ${modelId}`)
    } else {
      const prompt = schemaSystemBlock(rawSchema, req.responseFormat.name)
      body.system = body.system ? `${body.system}\n\n${prompt}` : prompt
      log.info(`Prompt-injected structured output for model: ${modelId}`)
    }
  }

  // Apply thinking configuration
  if (req.thinkingLevel && req.thinkingLevel !== 'none') {
    const tf = thinkingFieldsFor(req.model, req.thinkingLevel)
    if (tf) {
      body.thinking = tf.thinking
      if (tf.outputConfig) body.output_config = tf.outputConfig

      if (tf.thinking.type === 'enabled' && 'budget_tokens' in tf.thinking) {
        const budget = tf.thinking.budget_tokens
        const minRequired = budget + 4096
        if (body.max_tokens < minRequired) {
          body.max_tokens = Math.min(minRequired, getMaxOutputTokensForModel(req.model))
          log.info(`max_tokens raised to ${body.max_tokens} for budget_tokens (${budget})`)
        }
      }
      body.temperature = undefined // incompatible with thinking

      const adaptive = tf.thinking.type === 'adaptive'
      log.info(
        `${adaptive ? 'Adaptive' : 'Extended'} thinking: model=${modelId}, ` +
          `${adaptive ? `effort=${req.thinkingLevel}` : `budget=${(tf.thinking as { budget_tokens: number }).budget_tokens}`}`
      )
    } else {
      log.warn(`Thinking level "${req.thinkingLevel}" not available for model: ${modelId}`)
    }
  }

  // Attach tools and tool_choice to body
  if (activeTools?.length) {
    body.tools = activeTools
    const thinkingOn = !!body.thinking
    if (thinkingOn) {
      if (choiceValue === 'none') body.tool_choice = { type: 'none' }
    } else if (choiceValue === 'none') {
      body.tool_choice = { type: 'none' }
    } else if (choiceValue !== 'auto') {
      body.tool_choice = choiceValue
    }
  }

  const wantStreamTools = req.streamToolCalls ?? false

  // ── Path A: pure streaming, no tools ──────────────────────────────────────

  if (req.stream && (!activeTools || activeTools.length === 0)) {
    log.info(`Streaming (no-tools) via ${providerLabel}`)
    const wall0 = Date.now()
    const wall0ISO = new Date(wall0).toISOString()

    const rawStream = await sdk.messages.create({
      ...body,
      stream: true,
    } as Anthropic.Messages.MessageCreateParamsStreaming)

    const env = newStreamEnvelope(req, wall0, wall0ISO)
    env.stream = createReadableStreamFromAnthropicStream(
      rawStream as AsyncIterable<RawMessageStreamEvent>,
      (text, usage) => {
        env.execution.output.content = text
        env.execution.output.tokens = {
          input: usage.input_tokens,
          output: usage.output_tokens,
          total: usage.input_tokens + usage.output_tokens,
        }
        const c = calculateCost(req.model, usage.input_tokens, usage.output_tokens)
        env.execution.output.cost = c

        const end = Date.now()
        const endISO = new Date(end).toISOString()
        if (env.execution.output.providerTiming) {
          env.execution.output.providerTiming.endTime = endISO
          env.execution.output.providerTiming.duration = end - wall0
          const seg = env.execution.output.providerTiming.timeSegments
          if (seg?.[0]) {
            seg[0].endTime = end
            seg[0].duration = end - wall0
          }
        }
      }
    )
    return env
  }

  // ── Path B: streaming requested + tools → silent tool pass then stream ───

  if (req.stream && !wantStreamTools) {
    log.info(`Silent tool-pass then streaming via ${providerLabel}`)
    const wall0 = Date.now()
    const wall0ISO = new Date(wall0).toISOString()

    try {
      const issued = Date.now()
      const first = await dispatch(sdk, body)
      const summary = await iterateTools(sdk, body, first, history, prepState, req, log, issued)

      const accumulated = calculateCost(
        req.model,
        summary.accTokens.input,
        summary.accTokens.output
      )
      const finalBody = { ...body, messages: summary.tail, stream: true, tool_choice: undefined }
      const rawStream = await sdk.messages.create(
        finalBody as Anthropic.Messages.MessageCreateParamsStreaming
      )

      const env = newStreamEnvelope(req, wall0, wall0ISO, summary)
      env.stream = createReadableStreamFromAnthropicStream(
        rawStream as AsyncIterable<RawMessageStreamEvent>,
        (text, usage) => {
          env.execution.output.content = text
          env.execution.output.tokens = {
            input: summary.accTokens.input + usage.input_tokens,
            output: summary.accTokens.output + usage.output_tokens,
            total: summary.accTokens.total + usage.input_tokens + usage.output_tokens,
          }
          const sc = calculateCost(req.model, usage.input_tokens, usage.output_tokens)
          env.execution.output.cost = {
            input: accumulated.input + sc.input,
            output: accumulated.output + sc.output,
            total: accumulated.total + sc.total,
          }
          const end = Date.now()
          if (env.execution.output.providerTiming) {
            env.execution.output.providerTiming.endTime = new Date(end).toISOString()
            env.execution.output.providerTiming.duration = end - wall0
          }
        }
      )
      return env
    } catch (e) {
      const end = Date.now()
      log.error(`${providerLabel} request failed:`, { error: e, duration: end - wall0 })
      throw new ProviderError(e instanceof Error ? e.message : String(e), {
        startTime: wall0ISO,
        endTime: new Date(end).toISOString(),
        duration: end - wall0,
      })
    }
  }

  // ── Path C: non-streaming (or stream-after-tools) ────────────────────────

  const wall0 = Date.now()
  const wall0ISO = new Date(wall0).toISOString()

  try {
    const issued = Date.now()
    const first = await dispatch(sdk, body)
    const summary = await iterateTools(sdk, body, first, history, prepState, req, log, issued)

    if (req.stream) {
      log.info(`Streaming final response after tool iterations via ${providerLabel}`)
      const accumulated = summary.accCost
      const finalBody = { ...body, messages: summary.tail, stream: true, tool_choice: undefined }
      const rawStream = await sdk.messages.create(
        finalBody as Anthropic.Messages.MessageCreateParamsStreaming
      )

      const env = newStreamEnvelope(req, wall0, wall0ISO, summary)
      env.stream = createReadableStreamFromAnthropicStream(
        rawStream as AsyncIterable<RawMessageStreamEvent>,
        (text, usage) => {
          env.execution.output.content = text
          env.execution.output.tokens = {
            input: summary.accTokens.input + usage.input_tokens,
            output: summary.accTokens.output + usage.output_tokens,
            total: summary.accTokens.total + usage.input_tokens + usage.output_tokens,
          }
          const sc = calculateCost(req.model, usage.input_tokens, usage.output_tokens)
          env.execution.output.cost = {
            input: accumulated.input + sc.input,
            output: accumulated.output + sc.output,
            total: accumulated.total + sc.total,
          }
          const end = Date.now()
          if (env.execution.output.providerTiming) {
            env.execution.output.providerTiming.endTime = new Date(end).toISOString()
            env.execution.output.providerTiming.duration = end - wall0
          }
        }
      )
      return env
    }

    const end = Date.now()
    const endISO = new Date(end).toISOString()

    return {
      content: summary.finalText,
      model: req.model,
      tokens: summary.accTokens,
      toolCalls:
        summary.calls.length > 0
          ? summary.calls.map((c) => ({
              name: c.name,
              arguments: c.arguments,
              startTime: c.startTime,
              endTime: c.endTime,
              duration: c.duration,
              result: c.result as Record<string, unknown> | undefined,
            }))
          : undefined,
      toolResults: summary.outputs.length > 0 ? summary.outputs : undefined,
      timing: {
        startTime: wall0ISO,
        endTime: endISO,
        duration: end - wall0,
        modelTime: summary.elapsedModel,
        toolsTime: summary.elapsedTools,
        firstResponseTime: summary.firstLatency,
        iterations: summary.rounds + 1,
        timeSegments: summary.segments,
      },
    }
  } catch (e) {
    const end = Date.now()
    log.error(`${providerLabel} request failed:`, { error: e, duration: end - wall0 })
    throw new ProviderError(e instanceof Error ? e.message : String(e), {
      startTime: wall0ISO,
      endTime: new Date(end).toISOString(),
      duration: end - wall0,
    })
  }
}

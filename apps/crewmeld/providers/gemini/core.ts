import { createLogger } from '@crewmeld/logger'
import {
  type Content,
  FunctionCallingConfigMode,
  type FunctionDeclaration,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type GoogleGenAI,
  type Interactions,
  type Part,
  type Schema,
  type ThinkingConfig,
  type ToolConfig,
} from '@google/genai'
import { executeTool } from '@/lib/tools/execute-custom-skill'
import type { StreamingExecution } from '@/lib/types/execution'
import { MAX_TOOL_ITERATIONS } from '@/providers'
import {
  checkForForcedToolUsage,
  cleanSchemaForGemini,
  convertToGeminiFormat,
  convertUsageMetadata,
  createReadableStreamFromGeminiStream,
  ensureStructResponse,
  extractAllFunctionCallParts,
  extractTextContent,
  mapToThinkingLevel,
} from '@/providers/google/utils'
import type { FunctionCallResponse, ProviderRequest, ProviderResponse } from '@/providers/types'
import {
  calculateCost,
  isDeepResearchModel,
  prepareToolExecution,
  prepareToolsWithUsageControl,
} from '@/providers/utils'
import type { ExecutionState, GeminiProviderType, GeminiUsage } from './types'

// ── Timing constants ──────────────────────────────────────────────────────────

/** Milliseconds between deep-research polling attempts */
const POLL_INTERVAL_MS = 10_000

/** Maximum wall-clock duration for a single deep-research interaction */
const MAX_RESEARCH_DURATION_MS = 60 * 60 * 1000

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Resolves after `ms` milliseconds without blocking the event loop */
function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Context factory ───────────────────────────────────────────────────────────

/**
 * Allocates and populates the initial execution context for a Gemini call.
 * The context is mutated in place as each tool-use iteration completes.
 */
function seedExecutionContext(
  contents: Content[],
  initialUsage: GeminiUsage,
  latencyMs: number,
  callOriginTime: number,
  model: string,
  toolCfg: ToolConfig | undefined
): ExecutionState {
  const seedCost = calculateCost(
    model,
    initialUsage.promptTokenCount,
    initialUsage.candidatesTokenCount
  )

  return {
    transcript: contents,
    tally: {
      prompt: initialUsage.promptTokenCount,
      generated: initialUsage.candidatesTokenCount,
      combined: initialUsage.totalTokenCount,
    },
    bill: {
      prompt: seedCost.input,
      generated: seedCost.output,
      combined: seedCost.total,
      rate: seedCost.pricing,
    },
    invocations: [],
    outputs: [],
    rounds: 0,
    modelWallMs: latencyMs,
    toolWallMs: 0,
    segments: [
      {
        type: 'model',
        name: 'Initial response',
        startTime: callOriginTime,
        endTime: callOriginTime + latencyMs,
        duration: latencyMs,
      },
    ],
    consumedPins: [],
    activeCfg: toolCfg,
  }
}

// ── Batch tool runner ─────────────────────────────────────────────────────────

/**
 * Dispatches every function-call part from a single Gemini candidate in parallel,
 * then stitches the outcomes back into the execution context.
 *
 * Gemini expects batched function calls to be returned as a single model message
 * followed by a single user message that contains all the corresponding responses.
 */
async function runFunctionCallBatch(
  callParts: Part[],
  req: ProviderRequest,
  ctx: ExecutionState,
  pinnedTools: string[],
  log: ReturnType<typeof createLogger>
): Promise<{ dispatched: boolean; ctx: ExecutionState }> {
  if (callParts.length === 0) return { dispatched: false, ctx }

  const dispatchJobs = callParts.map(async (part) => {
    const originMs = Date.now()
    const fc = part.functionCall!
    const toolId = fc.name ?? ''
    const argv = (fc.args ?? {}) as Record<string, unknown>

    const toolDef = req.tools?.find((t) => t.id === toolId)
    if (!toolDef) {
      log.warn(`Tool ${toolId} not found in registry, skipping`)
      return {
        dispatched: false,
        part,
        toolId,
        argv,
        reply: { error: true, message: `Tool ${toolId} not found`, tool: toolId },
        params: {},
        originMs,
        settledMs: Date.now(),
        elapsedMs: Date.now() - originMs,
      }
    }

    try {
      const { toolParams, executionParams } = prepareToolExecution(toolDef, argv, req)
      const outcome = await executeTool(toolId, executionParams)
      const settledMs = Date.now()
      const elapsedMs = settledMs - originMs

      const reply: Record<string, unknown> = outcome.success
        ? ensureStructResponse(outcome.output)
        : { error: true, message: outcome.error || 'Tool execution failed', tool: toolId }

      return {
        dispatched: outcome.success,
        part,
        toolId,
        argv,
        reply,
        params: toolParams,
        outcome,
        originMs,
        settledMs,
        elapsedMs,
      }
    } catch (err) {
      const settledMs = Date.now()
      log.error('Error processing function call:', {
        error: err instanceof Error ? err.message : String(err),
        functionName: toolId,
      })
      return {
        dispatched: false,
        part,
        toolId,
        argv,
        reply: {
          error: true,
          message: err instanceof Error ? err.message : 'Tool execution failed',
          tool: toolId,
        },
        params: {},
        originMs,
        settledMs,
        elapsedMs: settledMs - originMs,
      }
    }
  })

  const outcomes = await Promise.all(dispatchJobs)

  const hasAnyValid = outcomes.some((o) => o.outcome !== undefined)
  if (!hasAnyValid && outcomes.every((o) => !o.dispatched)) {
    return { dispatched: false, ctx }
  }

  // Gemini spec: one model message with all call parts, one user message with all responses
  const modelParts: Part[] = outcomes.map((o) => o.part)
  const replyParts: Part[] = outcomes.map((o) => ({
    functionResponse: { name: o.toolId, response: o.reply },
  }))

  const extendedHistory: Content[] = [
    ...ctx.transcript,
    { role: 'model', parts: modelParts },
    { role: 'user', parts: replyParts },
  ]

  const appendedCalls: FunctionCallResponse[] = []
  const appendedOutputs: Record<string, unknown>[] = []
  const appendedSegments: ExecutionState['segments'] = []
  let batchToolsTime = 0

  for (const o of outcomes) {
    appendedCalls.push({
      name: o.toolId,
      arguments: o.params,
      startTime: new Date(o.originMs).toISOString(),
      endTime: new Date(o.settledMs).toISOString(),
      duration: o.elapsedMs,
      result: o.reply,
    })

    if (o.dispatched && o.outcome?.output) {
      appendedOutputs.push(o.outcome.output as Record<string, unknown>)
    }

    appendedSegments.push({
      type: 'tool',
      name: o.toolId,
      startTime: o.originMs,
      endTime: o.settledMs,
      duration: o.elapsedMs,
    })

    batchToolsTime += o.elapsedMs
  }

  const calledToolsInfo = outcomes.map((o) => ({ name: o.toolId, args: o.argv }))
  const forcedCheck = checkForForcedToolUsage(
    calledToolsInfo,
    ctx.activeCfg,
    pinnedTools,
    ctx.consumedPins
  )

  return {
    dispatched: true,
    ctx: {
      ...ctx,
      transcript: extendedHistory,
      invocations: [...ctx.invocations, ...appendedCalls],
      outputs: [...ctx.outputs, ...appendedOutputs],
      toolWallMs: ctx.toolWallMs + batchToolsTime,
      segments: [...ctx.segments, ...appendedSegments],
      consumedPins: forcedCheck?.usedForcedTools ?? ctx.consumedPins,
      activeCfg: forcedCheck?.nextToolConfig ?? ctx.activeCfg,
    },
  }
}

// ── Context merger ────────────────────────────────────────────────────────────

/**
 * Folds a fresh model response's usage and timing metadata into the running context.
 * Called after every model call inside the tool-use loop.
 */
function mergeResponseIntoContext(
  ctx: ExecutionState,
  reply: GenerateContentResponse,
  model: string,
  callStart: number,
  callEnd: number
): ExecutionState {
  const usage = convertUsageMetadata(reply.usageMetadata)
  const cost = calculateCost(model, usage.promptTokenCount, usage.candidatesTokenCount)
  const callDuration = callEnd - callStart

  return {
    ...ctx,
    tally: {
      prompt: ctx.tally.prompt + usage.promptTokenCount,
      generated: ctx.tally.generated + usage.candidatesTokenCount,
      combined: ctx.tally.combined + usage.totalTokenCount,
    },
    bill: {
      prompt: ctx.bill.prompt + cost.input,
      generated: ctx.bill.generated + cost.output,
      combined: ctx.bill.combined + cost.total,
      rate: cost.pricing,
    },
    modelWallMs: ctx.modelWallMs + callDuration,
    segments: [
      ...ctx.segments,
      {
        type: 'model',
        name: `Model response (iteration ${ctx.rounds + 1})`,
        startTime: callStart,
        endTime: callEnd,
        duration: callDuration,
      },
    ],
    rounds: ctx.rounds + 1,
  }
}

// ── Iteration config builder ──────────────────────────────────────────────────

/**
 * Derives the GenerateContentConfig for the next iteration of the tool-use loop.
 * Switches to structured output when all forced tools have been consumed and
 * a response format was requested.
 */
function deriveIterationConfig(
  baseCfg: GenerateContentConfig,
  ctx: ExecutionState,
  pinnedTools: string[],
  req: ProviderRequest,
  log: ReturnType<typeof createLogger>
): GenerateContentConfig {
  const next = { ...baseCfg }
  const allPinnedConsumed = pinnedTools.length > 0 && ctx.consumedPins.length === pinnedTools.length

  if (allPinnedConsumed && req.responseFormat) {
    next.tools = undefined
    next.toolConfig = undefined
    next.responseMimeType = 'application/json'
    next.responseSchema = cleanSchemaForGemini(req.responseFormat.schema) as Schema
    log.info('Using structured output for final response after tool execution')
  } else if (ctx.activeCfg) {
    next.toolConfig = ctx.activeCfg
  } else {
    next.toolConfig = { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } }
  }

  return next
}

// ── Streaming envelope factory ────────────────────────────────────────────────

/**
 * Allocates a StreamingExecution shell with all timing fields pre-populated.
 * The caller mutates `.stream` and `.execution.output` once the actual stream
 * is available.
 */
function scaffoldStreamResult(
  providerOrigin: number,
  providerOriginISO: string,
  latencyMs: number,
  callOriginTime: number,
  ctx?: ExecutionState
): StreamingExecution {
  return {
    stream: undefined as unknown as ReadableStream<Uint8Array>,
    execution: {
      success: true,
      output: {
        content: '',
        model: '',
        tokens: ctx
          ? { input: ctx.tally.prompt, output: ctx.tally.generated, total: ctx.tally.combined }
          : { input: 0, output: 0, total: 0 },
        toolCalls: ctx?.invocations.length
          ? { list: ctx.invocations, count: ctx.invocations.length }
          : undefined,
        toolResults: ctx?.outputs,
        providerTiming: {
          startTime: providerOriginISO,
          endTime: new Date().toISOString(),
          duration: Date.now() - providerOrigin,
          modelTime: ctx?.modelWallMs ?? latencyMs,
          toolsTime: ctx?.toolWallMs ?? 0,
          firstResponseTime: latencyMs,
          iterations: (ctx?.rounds ?? 0) + 1,
          timeSegments: ctx?.segments ?? [
            {
              type: 'model',
              name: 'Initial streaming response',
              startTime: callOriginTime,
              endTime: callOriginTime + latencyMs,
              duration: latencyMs,
            },
          ],
        },
        cost: ctx
          ? {
              input: ctx.bill.prompt,
              output: ctx.bill.generated,
              total: ctx.bill.combined,
              pricing: ctx.bill.rate,
            }
          : {
              input: 0,
              output: 0,
              total: 0,
              pricing: { input: 0, output: 0, updatedAt: new Date().toISOString() },
            },
      },
      logs: [],
      metadata: {
        startTime: providerOriginISO,
        endTime: new Date().toISOString(),
        duration: Date.now() - providerOrigin,
      },
      isStreaming: true,
    },
  }
}

// ── Public execution config ───────────────────────────────────────────────────

/**
 * All inputs required to drive a single Gemini (or Vertex) request.
 * Passed unchanged to both `executeGeminiRequest` and `executeDeepResearchRequest`.
 */
export interface GeminiExecutionConfig {
  ai: GoogleGenAI
  model: string
  request: ProviderRequest
  providerType: GeminiProviderType
}

// ── Deep-research helpers ─────────────────────────────────────────────────────

/**
 * Collapses the multi-turn message list in a ProviderRequest into the flat
 * `input` string expected by the Interactions API.
 *
 * Deep research is single-turn: only the last user message is forwarded as the
 * research query; all system messages are joined into `systemInstruction`.
 */
function flattenRequestToPrompt(req: ProviderRequest): {
  input: string
  systemInstruction: string | undefined
} {
  const sysParts: string[] = []
  const humanParts: string[] = []

  if (req.systemPrompt) sysParts.push(req.systemPrompt)

  for (const msg of req.messages ?? []) {
    if (msg.role === 'system' && msg.content) sysParts.push(msg.content)
    else if (msg.role === 'user' && msg.content) humanParts.push(msg.content)
  }

  return {
    input:
      humanParts.length > 0
        ? humanParts[humanParts.length - 1]
        : 'Please conduct research on the provided topic.',
    systemInstruction: sysParts.length > 0 ? sysParts.join('\n\n') : undefined,
  }
}

/**
 * Reassembles the full report text from an Interaction's outputs array.
 * Only `text`-typed output segments are included.
 */
function gatherResearchText(outputs: Interactions.Interaction['outputs']): string {
  if (!outputs || outputs.length === 0) return ''
  const segments: string[] = []
  for (const out of outputs) {
    if (out.type === 'text') {
      const txt = (out as Interactions.TextContent).text
      if (txt) segments.push(txt)
    }
  }
  return segments.join('\n\n')
}

/**
 * Converts an Interaction's Usage object into a normalised token-count record.
 * Handles both the SDK field name (`total_reasoning_tokens`) and the raw API
 * field name (`total_thought_tokens`) that the SDK may not yet alias.
 */
function parseInteractionMetrics(usage: Interactions.Usage | undefined): {
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  totalTokens: number
} {
  if (!usage) return { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 }

  const metricsLog = createLogger('DeepResearchUsage')
  metricsLog.info('Raw interaction usage', { usage: JSON.stringify(usage) })

  const inputTokens = usage.total_input_tokens ?? 0
  const outputTokens = usage.total_output_tokens ?? 0
  const reasoningTokens =
    usage.total_reasoning_tokens ??
    ((usage as Record<string, unknown>).total_thought_tokens as number) ??
    0
  const totalTokens = usage.total_tokens ?? inputTokens + outputTokens

  return { inputTokens, outputTokens, reasoningTokens, totalTokens }
}

/** Token metrics shape returned by `parseInteractionMetrics` */
interface InteractionMetrics {
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  totalTokens: number
}

/**
 * Builds a complete ProviderResponse for a finished deep-research interaction.
 */
function assembleResearchReply(
  text: string,
  model: string,
  metrics: InteractionMetrics,
  providerOrigin: number,
  providerOriginISO: string,
  interactionId?: string
): ProviderResponse {
  const finishedAt = Date.now()
  const elapsed = finishedAt - providerOrigin

  return {
    content: text,
    model,
    tokens: {
      input: metrics.inputTokens,
      output: metrics.outputTokens,
      total: metrics.totalTokens,
    },
    timing: {
      startTime: providerOriginISO,
      endTime: new Date(finishedAt).toISOString(),
      duration: elapsed,
      modelTime: elapsed,
      toolsTime: 0,
      firstResponseTime: elapsed,
      iterations: 1,
      timeSegments: [
        {
          type: 'model',
          name: 'Deep research',
          startTime: providerOrigin,
          endTime: finishedAt,
          duration: elapsed,
        },
      ],
    },
    cost: calculateCost(model, metrics.inputTokens, metrics.outputTokens),
    interactionId,
  }
}

/**
 * Wraps an Interactions SSE stream into a WHATWG ReadableStream of UTF-8 bytes.
 *
 * Recognised event types:
 * - `content.delta` — text fragments forwarded downstream
 * - `interaction.complete` — final usage metrics and interaction ID
 * - `interaction.start` — captures the interaction ID early
 * - `error` — terminates the stream with an error
 */
function wrapResearchStream(
  sseStream: AsyncIterable<Interactions.InteractionSSEEvent>,
  onSettled?: (text: string, metrics: InteractionMetrics, interactionId?: string) => void
): ReadableStream<Uint8Array> {
  const streamLog = createLogger('DeepResearchStream')
  let assembled = ''
  let settledMetrics: InteractionMetrics = {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  }
  let capturedId: string | undefined

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of sseStream) {
          if (ev.event_type === 'content.delta') {
            const delta = (ev as Interactions.ContentDelta).delta
            if (delta?.type === 'text' && 'text' in delta && delta.text) {
              assembled += delta.text
              controller.enqueue(new TextEncoder().encode(delta.text))
            }
          } else if (ev.event_type === 'interaction.complete') {
            const interaction = (ev as Interactions.InteractionEvent).interaction
            if (interaction?.usage) {
              settledMetrics = parseInteractionMetrics(interaction.usage)
            }
            capturedId = interaction?.id
          } else if (ev.event_type === 'interaction.start') {
            const interaction = (ev as Interactions.InteractionEvent).interaction
            if (interaction?.id) capturedId = interaction.id
          } else if (ev.event_type === 'error') {
            const errEv = ev as { error?: { code?: string; message?: string } }
            const msg = errEv.error?.message ?? 'Unknown deep research stream error'
            streamLog.error('Deep research stream error', { code: errEv.error?.code, message: msg })
            controller.error(new Error(msg))
            return
          }
        }

        onSettled?.(assembled, settledMetrics, capturedId)
        controller.close()
      } catch (err) {
        streamLog.error('Error reading deep research stream', {
          error: err instanceof Error ? err.message : String(err),
        })
        controller.error(err)
      }
    },
  })
}

// ── Deep-research executor ────────────────────────────────────────────────────

/**
 * Executes a deep-research request via the Google Interactions API.
 *
 * Deep research runs as a background `Interaction` (up to 60 minutes) and
 * does not support tools, MCP servers, or structured output — these inputs
 * are silently ignored with a warning log.
 *
 * Supports both streaming (returns a StreamingExecution) and non-streaming
 * (polls until the interaction reaches a terminal status, then returns a
 * ProviderResponse).
 */
export async function executeDeepResearchRequest(
  config: GeminiExecutionConfig
): Promise<ProviderResponse | StreamingExecution> {
  const { ai, model, request, providerType } = config
  const log = createLogger(providerType === 'google' ? 'GoogleProvider' : 'VertexProvider')

  log.info('Preparing deep research request', {
    model,
    hasSystemPrompt: !!request.systemPrompt,
    hasMessages: !!request.messages?.length,
    streaming: !!request.stream,
    hasPreviousInteractionId: !!request.previousInteractionId,
  })

  if (request.tools?.length) {
    log.warn('Deep research does not support custom tools — ignoring tools parameter')
  }
  if (request.responseFormat) {
    log.warn('Deep research does not support structured output — ignoring responseFormat parameter')
  }

  const providerOrigin = Date.now()
  const providerOriginISO = new Date(providerOrigin).toISOString()

  try {
    const { input, systemInstruction } = flattenRequestToPrompt(request)

    const sharedParams = {
      agent: model as Interactions.CreateAgentInteractionParamsNonStreaming['agent'],
      input,
      background: true,
      store: true,
      ...(systemInstruction && { system_instruction: systemInstruction }),
      ...(request.previousInteractionId && {
        previous_interaction_id: request.previousInteractionId,
      }),
      agent_config: {
        type: 'deep-research' as const,
        thinking_summaries: 'auto' as const,
      },
    }

    log.info('Creating deep research interaction', {
      inputLength: input.length,
      hasSystemInstruction: !!systemInstruction,
      streaming: !!request.stream,
    })

    if (request.stream) {
      const streamParams: Interactions.CreateAgentInteractionParamsStreaming = {
        ...sharedParams,
        stream: true,
      }

      const sseResponse = await ai.interactions.create(streamParams)
      const latencyMs = Date.now() - providerOrigin

      const envelope: StreamingExecution = {
        stream: undefined as unknown as ReadableStream<Uint8Array>,
        execution: {
          success: true,
          output: {
            content: '',
            model,
            tokens: { input: 0, output: 0, total: 0 },
            providerTiming: {
              startTime: providerOriginISO,
              endTime: new Date().toISOString(),
              duration: Date.now() - providerOrigin,
              modelTime: latencyMs,
              toolsTime: 0,
              firstResponseTime: latencyMs,
              iterations: 1,
              timeSegments: [
                {
                  type: 'model',
                  name: 'Deep research (streaming)',
                  startTime: providerOrigin,
                  endTime: providerOrigin + latencyMs,
                  duration: latencyMs,
                },
              ],
            },
            cost: {
              input: 0,
              output: 0,
              total: 0,
              pricing: { input: 0, output: 0, updatedAt: new Date().toISOString() },
            },
          },
          logs: [],
          metadata: {
            startTime: providerOriginISO,
            endTime: new Date().toISOString(),
            duration: Date.now() - providerOrigin,
          },
          isStreaming: true,
        },
      }

      envelope.stream = wrapResearchStream(sseResponse, (text, metrics, interactionId) => {
        envelope.execution.output.content = text
        envelope.execution.output.tokens = {
          input: metrics.inputTokens,
          output: metrics.outputTokens,
          total: metrics.totalTokens,
        }
        envelope.execution.output.interactionId = interactionId

        const costResult = calculateCost(model, metrics.inputTokens, metrics.outputTokens)
        envelope.execution.output.cost = costResult

        const finishedAt = Date.now()
        if (envelope.execution.output.providerTiming) {
          envelope.execution.output.providerTiming.endTime = new Date(finishedAt).toISOString()
          envelope.execution.output.providerTiming.duration = finishedAt - providerOrigin
          const segs = envelope.execution.output.providerTiming.timeSegments
          if (segs?.[0]) {
            segs[0].endTime = finishedAt
            segs[0].duration = finishedAt - providerOrigin
          }
        }
      })

      return envelope
    }

    // Non-streaming: create, then poll to completion
    const pollParams: Interactions.CreateAgentInteractionParamsNonStreaming = {
      ...sharedParams,
      stream: false,
    }

    const created = await ai.interactions.create(pollParams)
    const interactionId = created.id

    log.info('Deep research interaction created', {
      interactionId,
      status: created.status,
    })

    const pollOrigin = Date.now()
    let current: Interactions.Interaction = created

    while (Date.now() - pollOrigin < MAX_RESEARCH_DURATION_MS) {
      if (current.status === 'completed') break

      if (current.status === 'failed') {
        throw new Error(`Deep research interaction failed: ${interactionId}`)
      }

      if (current.status === 'cancelled') {
        throw new Error(`Deep research interaction was cancelled: ${interactionId}`)
      }

      log.info('Deep research in progress, polling...', {
        interactionId,
        status: current.status,
        elapsedMs: Date.now() - pollOrigin,
      })

      await pause(POLL_INTERVAL_MS)
      current = await ai.interactions.get(interactionId)
    }

    if (current.status !== 'completed') {
      throw new Error(
        `Deep research timed out after ${MAX_RESEARCH_DURATION_MS / 1000}s (status: ${current.status})`
      )
    }

    const reportText = gatherResearchText(current.outputs)
    const metrics = parseInteractionMetrics(current.usage)

    log.info('Deep research completed', {
      interactionId,
      contentLength: reportText.length,
      inputTokens: metrics.inputTokens,
      outputTokens: metrics.outputTokens,
      reasoningTokens: metrics.reasoningTokens,
      totalTokens: metrics.totalTokens,
      durationMs: Date.now() - providerOrigin,
    })

    return assembleResearchReply(
      reportText,
      model,
      metrics,
      providerOrigin,
      providerOriginISO,
      interactionId
    )
  } catch (err) {
    const finishedAt = Date.now()
    const elapsed = finishedAt - providerOrigin

    log.error('Error in deep research request:', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })

    const wrapped = err instanceof Error ? err : new Error(String(err))
    Object.assign(wrapped, {
      timing: {
        startTime: providerOriginISO,
        endTime: new Date(finishedAt).toISOString(),
        duration: elapsed,
      },
    })
    throw wrapped
  }
}

// ── Main Gemini executor ──────────────────────────────────────────────────────

/**
 * Shared execution core for both Google Gemini and Vertex AI providers.
 *
 * Handles streaming, non-streaming, and tool-use loops. Routes deep-research
 * model identifiers to `executeDeepResearchRequest` automatically.
 */
export async function executeGeminiRequest(
  config: GeminiExecutionConfig
): Promise<ProviderResponse | StreamingExecution> {
  const { ai, model, request, providerType } = config

  if (isDeepResearchModel(model)) {
    return executeDeepResearchRequest(config)
  }

  const log = createLogger(providerType === 'google' ? 'GoogleProvider' : 'VertexProvider')

  log.info(`Preparing ${providerType} Gemini request`, {
    model,
    hasSystemPrompt: !!request.systemPrompt,
    hasMessages: !!request.messages?.length,
    hasTools: !!request.tools?.length,
    toolCount: request.tools?.length ?? 0,
    hasResponseFormat: !!request.responseFormat,
    streaming: !!request.stream,
  })

  const providerOrigin = Date.now()
  const providerOriginISO = new Date(providerOrigin).toISOString()

  try {
    const { contents, tools, systemInstruction } = convertToGeminiFormat(request)

    const genCfg: GenerateContentConfig = {}

    if (request.temperature !== undefined) genCfg.temperature = request.temperature
    if (request.maxTokens != null) genCfg.maxOutputTokens = request.maxTokens
    if (systemInstruction) genCfg.systemInstruction = systemInstruction

    if (request.responseFormat && !tools?.length) {
      genCfg.responseMimeType = 'application/json'
      genCfg.responseSchema = cleanSchemaForGemini(request.responseFormat.schema) as Schema
      log.info('Using Gemini native structured output format')
    } else if (request.responseFormat && tools?.length) {
      log.warn('Gemini does not support responseFormat with tools. Structured output ignored.')
    }

    if (request.thinkingLevel && request.thinkingLevel !== 'none') {
      const thinkCfg: ThinkingConfig = {
        includeThoughts: false,
        thinkingLevel: mapToThinkingLevel(request.thinkingLevel),
      }
      genCfg.thinkingConfig = thinkCfg
    }

    let preparedTools: ReturnType<typeof prepareToolsWithUsageControl> | null = null
    let activeToolCfg: ToolConfig | undefined

    if (tools?.length) {
      const funcDecls: FunctionDeclaration[] = tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }))

      preparedTools = prepareToolsWithUsageControl(funcDecls, request.tools, log, 'google')
      const { tools: filteredDecls, toolConfig: derivedCfg } = preparedTools

      if (filteredDecls?.length) {
        genCfg.tools = [{ functionDeclarations: filteredDecls as FunctionDeclaration[] }]

        if (derivedCfg) {
          activeToolCfg = {
            functionCallingConfig: {
              mode:
                {
                  AUTO: FunctionCallingConfigMode.AUTO,
                  ANY: FunctionCallingConfigMode.ANY,
                  NONE: FunctionCallingConfigMode.NONE,
                }[derivedCfg.functionCallingConfig.mode] ?? FunctionCallingConfigMode.AUTO,
              allowedFunctionNames: derivedCfg.functionCallingConfig.allowedFunctionNames,
            },
          }
          genCfg.toolConfig = activeToolCfg
        }

        log.info('Gemini request with tools:', {
          toolCount: filteredDecls.length,
          model,
          tools: filteredDecls.map((t) => (t as FunctionDeclaration).name),
        })
      }
    }

    const callOriginTime = Date.now()
    const wantStream = request.stream && !tools?.length

    // ── Streaming path (no tools) ─────────────────────────────────────────────
    if (wantStream) {
      log.info('Handling Gemini streaming response')

      const streamGen = await ai.models.generateContentStream({
        model,
        contents,
        config: genCfg,
      })
      const latencyMs = Date.now() - callOriginTime

      const envelope = scaffoldStreamResult(
        providerOrigin,
        providerOriginISO,
        latencyMs,
        callOriginTime
      )
      envelope.execution.output.model = model

      envelope.stream = createReadableStreamFromGeminiStream(
        streamGen,
        (text: string, usage: GeminiUsage) => {
          envelope.execution.output.content = text
          envelope.execution.output.tokens = {
            input: usage.promptTokenCount,
            output: usage.candidatesTokenCount,
            total: usage.totalTokenCount,
          }

          const costResult = calculateCost(
            model,
            usage.promptTokenCount,
            usage.candidatesTokenCount
          )
          envelope.execution.output.cost = costResult

          const finishedAt = Date.now()
          if (envelope.execution.output.providerTiming) {
            envelope.execution.output.providerTiming.endTime = new Date(finishedAt).toISOString()
            envelope.execution.output.providerTiming.duration = finishedAt - providerOrigin
            const segs = envelope.execution.output.providerTiming.timeSegments
            if (segs?.[0]) {
              segs[0].endTime = finishedAt
              segs[0].duration = finishedAt - providerOrigin
            }
          }
        }
      )

      return envelope
    }

    // ── Non-streaming path ────────────────────────────────────────────────────
    const initialReply = await ai.models.generateContent({ model, contents, config: genCfg })
    const latencyMs = Date.now() - callOriginTime

    const candidate = initialReply.candidates?.[0]
    if (candidate?.finishReason === 'UNEXPECTED_TOOL_CALL') {
      log.warn('Gemini returned UNEXPECTED_TOOL_CALL - model attempted to call unknown tool')
    }

    const seedUsage = convertUsageMetadata(initialReply.usageMetadata)
    let ctx = seedExecutionContext(
      contents,
      seedUsage,
      latencyMs,
      callOriginTime,
      model,
      activeToolCfg
    )
    const pinnedTools = preparedTools?.forcedTools ?? []

    let latestReply = initialReply
    let finalText = ''

    const initialFunctionCalls = initialReply.functionCalls
    if (initialFunctionCalls?.length) {
      const fcNames = initialFunctionCalls.map((fc) => fc.name).join(', ')
      log.info(`Received ${initialFunctionCalls.length} function call(s) from Gemini: ${fcNames}`)

      while (ctx.rounds < MAX_TOOL_ITERATIONS) {
        const callParts = extractAllFunctionCallParts(latestReply.candidates?.[0])
        if (callParts.length === 0) {
          finalText = extractTextContent(latestReply.candidates?.[0])
          break
        }

        const partNames = callParts.map((p) => p.functionCall?.name ?? 'unknown').join(', ')
        log.info(
          `Processing ${callParts.length} function call(s): ${partNames} (iteration ${ctx.rounds + 1})`
        )

        const { dispatched, ctx: nextCtx } = await runFunctionCallBatch(
          callParts,
          request,
          ctx,
          pinnedTools,
          log
        )
        if (!dispatched) {
          finalText = extractTextContent(latestReply.candidates?.[0])
          break
        }

        ctx = { ...nextCtx, rounds: nextCtx.rounds + 1 }
        const iterCfg = deriveIterationConfig(genCfg, ctx, pinnedTools, request, log)

        if (request.stream) {
          const checkReply = await ai.models.generateContent({
            model,
            contents: ctx.transcript,
            config: iterCfg,
          })
          ctx = mergeResponseIntoContext(ctx, checkReply, model, Date.now() - 100, Date.now())

          if (checkReply.functionCalls?.length) {
            latestReply = checkReply
            continue
          }

          log.info('No more function calls, streaming final response')

          if (request.responseFormat) {
            iterCfg.tools = undefined
            iterCfg.toolConfig = undefined
            iterCfg.responseMimeType = 'application/json'
            iterCfg.responseSchema = cleanSchemaForGemini(request.responseFormat.schema) as Schema
          }

          const priorCost = {
            prompt: ctx.bill.prompt,
            generated: ctx.bill.generated,
            combined: ctx.bill.combined,
          }
          const priorTally = { ...ctx.tally }

          const finalStreamGen = await ai.models.generateContentStream({
            model,
            contents: ctx.transcript,
            config: iterCfg,
          })

          const envelope = scaffoldStreamResult(
            providerOrigin,
            providerOriginISO,
            latencyMs,
            callOriginTime,
            ctx
          )
          envelope.execution.output.model = model

          envelope.stream = createReadableStreamFromGeminiStream(
            finalStreamGen,
            (streamText: string, usage: GeminiUsage) => {
              envelope.execution.output.content = streamText
              envelope.execution.output.tokens = {
                input: priorTally.prompt + usage.promptTokenCount,
                output: priorTally.generated + usage.candidatesTokenCount,
                total: priorTally.combined + usage.totalTokenCount,
              }

              const streamCost = calculateCost(
                model,
                usage.promptTokenCount,
                usage.candidatesTokenCount
              )
              envelope.execution.output.cost = {
                input: priorCost.prompt + streamCost.input,
                output: priorCost.generated + streamCost.output,
                total: priorCost.combined + streamCost.total,
                pricing: streamCost.pricing,
              }

              if (envelope.execution.output.providerTiming) {
                envelope.execution.output.providerTiming.endTime = new Date().toISOString()
                envelope.execution.output.providerTiming.duration = Date.now() - providerOrigin
              }
            }
          )

          return envelope
        }

        const nextCallStart = Date.now()
        const nextModelReply = await ai.models.generateContent({
          model,
          contents: ctx.transcript,
          config: iterCfg,
        })
        ctx = mergeResponseIntoContext(ctx, nextModelReply, model, nextCallStart, Date.now())
        latestReply = nextModelReply
      }

      if (!finalText) {
        finalText = extractTextContent(latestReply.candidates?.[0])
      }
    } else {
      finalText = extractTextContent(candidate)
    }

    const providerEndTime = Date.now()

    return {
      content: finalText,
      model,
      tokens: { input: ctx.tally.prompt, output: ctx.tally.generated, total: ctx.tally.combined },
      toolCalls: ctx.invocations.length ? ctx.invocations : undefined,
      toolResults: ctx.outputs.length ? ctx.outputs : undefined,
      timing: {
        startTime: providerOriginISO,
        endTime: new Date(providerEndTime).toISOString(),
        duration: providerEndTime - providerOrigin,
        modelTime: ctx.modelWallMs,
        toolsTime: ctx.toolWallMs,
        firstResponseTime: latencyMs,
        iterations: ctx.rounds + 1,
        timeSegments: ctx.segments,
      },
      cost: {
        input: ctx.bill.prompt,
        output: ctx.bill.generated,
        total: ctx.bill.combined,
        pricing: ctx.bill.rate,
      },
    }
  } catch (err) {
    const finishedAt = Date.now()
    const elapsed = finishedAt - providerOrigin

    log.error('Error in Gemini request:', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })

    const wrapped = err instanceof Error ? err : new Error(String(err))
    Object.assign(wrapped, {
      timing: {
        startTime: providerOriginISO,
        endTime: new Date(finishedAt).toISOString(),
        duration: elapsed,
      },
    })
    throw wrapped
  }
}

import { createLogger } from '@crewmeld/logger'
import type OpenAI from 'openai'
import { executeTool } from '@/lib/tools/execute-custom-skill'
import type { StreamingExecution } from '@/lib/types/execution'
import { MAX_TOOL_ITERATIONS } from '@/providers'
import type {
  FunctionCallResponse,
  Message,
  ProviderRequest,
  ProviderResponse,
  TimeSegment,
} from '@/providers/types'
import { ProviderError } from '@/providers/types'
import {
  calculateCost,
  prepareToolExecution,
  prepareToolsWithUsageControl,
  trackForcedToolUsage,
} from '@/providers/utils'
import {
  buildResponsesInputFromMessages,
  convertResponseOutputToInputItems,
  convertToolsToResponses,
  createReadableStreamFromResponses,
  extractResponseText,
  extractResponseToolCalls,
  parseResponsesUsage,
  type ResponsesInputItem,
  type ResponsesToolCall,
  toResponsesToolChoice,
} from './utils'

// ── Internal types ─────────────────────────────────────────────────────────────

type PreparedTools = ReturnType<typeof prepareToolsWithUsageControl>
type ActiveToolChoice = PreparedTools['toolChoice']

// ── Module logger ──────────────────────────────────────────────────────────────

const log = createLogger('OpenAICore')

// ── Schema enforcement ─────────────────────────────────────────────────────────

/** JSON Schema keywords that carry sub-schemas to recurse into */
const SCHEMA_COMPOSITION_KEYWORDS = ['anyOf', 'oneOf', 'allOf'] as const

/** JSON Schema definition-block keys that carry named sub-schemas */
const SCHEMA_DEFINITION_KEYS = ['$defs', 'definitions'] as const

/**
 * Recursively rewrites a JSON Schema to satisfy OpenAI strict-mode requirements:
 * - All `object` nodes get `additionalProperties: false`
 * - All property keys are promoted to `required`
 * - Composition keywords (`anyOf`, `oneOf`, `allOf`) and definition blocks
 *   (`$defs`, `definitions`) are recursed into
 *
 * @param node - The JSON Schema node to normalise
 * @returns A new schema node that satisfies strict-mode constraints
 */
function applyStrictSchemaConstraints(node: Record<string, unknown>): Record<string, unknown> {
  if (!node || typeof node !== 'object') return node

  const out = { ...node }

  if (out.type === 'object') {
    out.additionalProperties = false

    if (out.properties && typeof out.properties === 'object') {
      const propNames = Object.keys(out.properties as Record<string, unknown>)
      out.required = propNames
      out.properties = Object.fromEntries(
        Object.entries(out.properties as Record<string, unknown>).map(([k, v]) => [
          k,
          applyStrictSchemaConstraints(v as Record<string, unknown>),
        ])
      )
    }
  }

  if (out.type === 'array' && out.items) {
    out.items = applyStrictSchemaConstraints(out.items as Record<string, unknown>)
  }

  for (const compositionKey of SCHEMA_COMPOSITION_KEYWORDS) {
    if (Array.isArray(out[compositionKey])) {
      out[compositionKey] = (out[compositionKey] as Record<string, unknown>[]).map(
        applyStrictSchemaConstraints
      )
    }
  }

  for (const defKey of SCHEMA_DEFINITION_KEYS) {
    if (out[defKey] && typeof out[defKey] === 'object') {
      out[defKey] = Object.fromEntries(
        Object.entries(out[defKey] as Record<string, unknown>).map(([k, v]) => [
          k,
          applyStrictSchemaConstraints(v as Record<string, unknown>),
        ])
      )
    }
  }

  return out
}

// ── Provider config ────────────────────────────────────────────────────────────

/**
 * Runtime configuration supplied by each OpenAI-compatible provider adapter
 * (OpenAI, Azure OpenAI, xAI, etc.) to the shared execution core.
 */
export interface ResponsesProviderConfig {
  /** Internal provider identifier used for routing and logging */
  providerId: string
  /** Human-readable provider name for log messages */
  providerLabel: string
  /** Model name forwarded to the API */
  modelName: string
  /** Full Responses API endpoint URL */
  endpoint: string
  /** HTTP headers (including Authorization) forwarded with every request */
  headers: Record<string, string>
  /** Logger instance bound to the calling provider */
  logger: ReturnType<typeof createLogger>
  /** Custom fetch for proxying foreign model requests; defaults to native fetch (direct) */
  fetch?: typeof globalThis.fetch
}

// ── Azure-specific constants ───────────────────────────────────────────────────

/** Provider ID string that triggers Azure-specific deferred-format behaviour */
const AZURE_PROVIDER_ID = 'azure-openai' as const

/** Tool-choice value used when reverting forced-tool sequencing to automatic */
const AUTO_TOOL_CHOICE = 'auto' as const

/** Parallel tool call flag forwarded to the Responses API payload */
const PARALLEL_TOOL_CALLS_ENABLED = true

// ── Timing segment labels ──────────────────────────────────────────────────────

/** Time-segment label for the initial (first) model round-trip */
const SEGMENT_INITIAL_RESPONSE = 'Initial response'

/** Time-segment label for the final stream delivered after tool processing */
const SEGMENT_STREAMING_RESPONSE = 'Streaming response'

/** Time-segment label for the deferred-format model round-trip */
const SEGMENT_FINAL_FORMATTED = 'Final formatted response'

// ── Error helpers ──────────────────────────────────────────────────────────────

/** HTTP method used for all Responses API requests */
const HTTP_POST = 'POST' as const

/**
 * Reads and parses the body of a non-2xx HTTP response, returning the
 * `error.message` field when available, or the raw body text otherwise.
 *
 * @param httpResp - A non-OK fetch Response from the Responses API
 * @returns Human-readable error description
 */
async function readErrorBody(httpResp: Response): Promise<string> {
  const raw = await httpResp.text()
  try {
    const parsed = JSON.parse(raw)
    return parsed?.error?.message || raw
  } catch {
    return raw
  }
}

// ── Streaming result factory ───────────────────────────────────────────────────

/**
 * Accumulated timing and cost data collected before streaming begins,
 * used to produce the initial `StreamingExecution` scaffold.
 */
interface StreamPreamble {
  /** Wall-clock epoch (ms) when the entire provider call started */
  wallStart: number
  /** ISO timestamp of `wallStart` */
  wallStartISO: string
  /** Accumulated tool-loop token counts from non-streaming rounds */
  priorTokens: { input: number; output: number; total: number }
  /** Accumulated cost from non-streaming rounds */
  priorCost: { input: number; output: number; total: number }
  /** Time segments collected before streaming begins */
  priorSegments: TimeSegment[]
  /** Total model wall-clock time accumulated before streaming */
  priorModelMs: number
  /** Total tool wall-clock time accumulated before streaming */
  priorToolMs: number
  /** Wall-clock time of the very first model response */
  firstRoundTripMs: number
  /** How many tool-call iterations completed before streaming */
  completedIterations: number
  /** Tool-call records gathered before streaming */
  gatheredToolCalls: FunctionCallResponse[]
}

/**
 * Builds the `StreamingExecution` envelope that is returned immediately while
 * the SSE body streams in the background.
 *
 * The `stream` property is a live `ReadableStream<Uint8Array>`; the nested
 * `execution` object is mutated in-place by the `onComplete` callback once
 * all SSE events have been consumed.
 *
 * @param fetchFn   - Fetch implementation to use for the streaming request
 * @param endpoint  - Full Responses API endpoint URL
 * @param reqHeaders - HTTP headers for the streaming request
 * @param bodyPayload - Serialisable request body
 * @param model     - Model string from the original ProviderRequest
 * @param preamble  - Timing/cost data accumulated before streaming
 * @param errorReadFn - Function to extract the body from a non-OK response
 * @param providerLabel - Provider display name for error messages
 * @returns The full StreamingExecution result
 */
async function buildStreamingResult(
  fetchFn: typeof globalThis.fetch,
  endpoint: string,
  reqHeaders: Record<string, string>,
  bodyPayload: Record<string, unknown>,
  model: string,
  preamble: StreamPreamble,
  errorReadFn: (r: Response) => Promise<string>,
  providerLabel: string
): Promise<StreamingExecution> {
  const {
    wallStart,
    wallStartISO,
    priorTokens,
    priorCost,
    priorSegments,
    priorModelMs,
    priorToolMs,
    firstRoundTripMs,
    completedIterations,
    gatheredToolCalls,
  } = preamble

  const rawStreamResp = await fetchFn(endpoint, {
    method: HTTP_POST,
    headers: reqHeaders,
    body: JSON.stringify(bodyPayload),
  })

  if (!rawStreamResp.ok) {
    const errBody = await errorReadFn(rawStreamResp)
    throw new Error(`${providerLabel} API error (${rawStreamResp.status}): ${errBody}`)
  }

  const envelope = {
    stream: createReadableStreamFromResponses(rawStreamResp, (streamedText, streamUsage) => {
      envelope.execution.output.content = streamedText
      envelope.execution.output.tokens = {
        input: priorTokens.input + (streamUsage?.promptTokens ?? 0),
        output: priorTokens.output + (streamUsage?.completionTokens ?? 0),
        total: priorTokens.total + (streamUsage?.totalTokens ?? 0),
      }

      const streamedCost = calculateCost(
        model,
        streamUsage?.promptTokens ?? 0,
        streamUsage?.completionTokens ?? 0
      )
      envelope.execution.output.cost = {
        input: priorCost.input + streamedCost.input,
        output: priorCost.output + streamedCost.output,
        total: priorCost.total + streamedCost.total,
      }

      const finishMs = Date.now()
      const finishISO = new Date(finishMs).toISOString()

      if (envelope.execution.output.providerTiming) {
        envelope.execution.output.providerTiming.endTime = finishISO
        envelope.execution.output.providerTiming.duration = finishMs - wallStart

        const firstSeg = envelope.execution.output.providerTiming.timeSegments?.[0]
        if (firstSeg) {
          firstSeg.endTime = finishMs
          firstSeg.duration = finishMs - wallStart
        }
      }
    }),
    execution: {
      success: true,
      output: {
        content: '',
        model,
        tokens: { input: priorTokens.input, output: priorTokens.output, total: priorTokens.total },
        toolCalls:
          gatheredToolCalls.length > 0
            ? { list: gatheredToolCalls, count: gatheredToolCalls.length }
            : undefined,
        providerTiming: {
          startTime: wallStartISO,
          endTime: new Date().toISOString(),
          duration: Date.now() - wallStart,
          modelTime: priorModelMs,
          toolsTime: priorToolMs,
          firstResponseTime: firstRoundTripMs,
          iterations: completedIterations + 1,
          timeSegments: priorSegments,
        },
        cost: { input: priorCost.input, output: priorCost.output, total: priorCost.total },
      },
      logs: [],
      metadata: {
        startTime: wallStartISO,
        endTime: new Date().toISOString(),
        duration: Date.now() - wallStart,
      },
    },
  } as StreamingExecution

  return envelope
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Unified Responses-API execution loop shared by all OpenAI-compatible providers.
 *
 * Handles:
 * - Direct and streaming responses (no tools)
 * - Multi-turn tool-call loops up to `MAX_TOOL_ITERATIONS`
 * - Azure-specific deferred JSON-schema response formatting
 * - Forced-tool sequencing via `prepareToolsWithUsageControl`
 * - Proxy fetch injection via `config.fetch`
 *
 * @param request - The normalised provider request from the CrewMeld executor
 * @param config  - Runtime configuration supplied by the calling provider adapter
 * @returns Either a `ProviderResponse` (non-streaming) or a `StreamingExecution`
 */
export async function executeResponsesProviderRequest(
  request: ProviderRequest,
  config: ResponsesProviderConfig
): Promise<ProviderResponse | StreamingExecution> {
  const { logger } = config
  const fetchFn = config.fetch ?? globalThis.fetch

  log.info(`Preparing ${config.providerLabel} request`, {
    model: request.model,
    hasSystemPrompt: !!request.systemPrompt,
    hasMessages: !!request.messages?.length,
    hasTools: !!request.tools?.length,
    toolCount: request.tools?.length ?? 0,
    hasResponseFormat: !!request.responseFormat,
    stream: !!request.stream,
  })

  // ── Assemble full message list ─────────────────────────────────────────────

  const fullMessageList: Message[] = []

  if (request.systemPrompt) {
    fullMessageList.push({ role: 'system', content: request.systemPrompt })
  }

  if (request.context) {
    fullMessageList.push({ role: 'user', content: request.context })
  }

  if (request.messages) {
    fullMessageList.push(...request.messages)
  }

  const firstTurnInput = buildResponsesInputFromMessages(fullMessageList)

  // ── Base payload ────────────────────────────────────────────────────────────

  const sharedPayload: Record<string, unknown> = { model: config.modelName }

  if (request.temperature !== undefined) sharedPayload.temperature = request.temperature
  if (request.maxTokens != null) sharedPayload.max_output_tokens = request.maxTokens

  if (request.reasoningEffort !== undefined && request.reasoningEffort !== AUTO_TOOL_CHOICE) {
    sharedPayload.reasoning = { effort: request.reasoningEffort, summary: AUTO_TOOL_CHOICE }
  }

  if (request.verbosity !== undefined && request.verbosity !== AUTO_TOOL_CHOICE) {
    sharedPayload.text = {
      ...((sharedPayload.text as Record<string, unknown>) ?? {}),
      verbosity: request.verbosity,
    }
  }

  // ── Response format ─────────────────────────────────────────────────────────

  const hasDeclaredTools = !!request.tools?.length
  const isAzureProvider = config.providerId === AZURE_PROVIDER_ID

  let pendingTextFormat: OpenAI.Responses.ResponseFormatTextJSONSchemaConfig | undefined

  if (request.responseFormat) {
    const strictEnabled = request.responseFormat.strict !== false
    const rawSchemaNode = request.responseFormat.schema || request.responseFormat
    const cleanedSchemaNode = strictEnabled
      ? applyStrictSchemaConstraints(rawSchemaNode)
      : rawSchemaNode

    const resolvedTextFormat = {
      type: 'json_schema' as const,
      name: request.responseFormat.name || 'response_schema',
      schema: cleanedSchemaNode,
      strict: strictEnabled,
    }

    if (isAzureProvider && hasDeclaredTools) {
      pendingTextFormat = resolvedTextFormat
      logger.info(
        `Deferring JSON schema response format for ${config.providerLabel} (will apply after tool calls complete)`
      )
    } else {
      sharedPayload.text = {
        ...((sharedPayload.text as Record<string, unknown>) ?? {}),
        format: resolvedTextFormat,
      }
      logger.info(`Added JSON schema response format to ${config.providerLabel} request`)
    }
  }

  // ── Tool preparation ────────────────────────────────────────────────────────

  const rawToolList = request.tools?.length
    ? request.tools.map((t) => ({
        type: 'function',
        function: { name: t.id, description: t.description, parameters: t.parameters },
      }))
    : undefined

  let toolBundle: PreparedTools | null = null
  let activeResponsesChoice: ReturnType<typeof toResponsesToolChoice> | undefined
  let activeTrackingChoice: ActiveToolChoice | undefined

  if (rawToolList?.length) {
    toolBundle = prepareToolsWithUsageControl(rawToolList, request.tools, logger, config.providerId)
    const { tools: filteredList, toolChoice: resolvedChoice } = toolBundle
    activeTrackingChoice = resolvedChoice

    if (filteredList?.length) {
      const convertedList = convertToolsToResponses(filteredList)
      if (!convertedList.length) throw new Error('All tools have empty names')

      sharedPayload.tools = convertedList
      sharedPayload.parallel_tool_calls = PARALLEL_TOOL_CALLS_ENABLED
    }

    if (resolvedChoice) {
      activeResponsesChoice = toResponsesToolChoice(resolvedChoice)
      if (activeResponsesChoice) sharedPayload.tool_choice = activeResponsesChoice

      logger.info(`${config.providerLabel} request configuration:`, {
        toolCount: filteredList?.length ?? 0,
        toolChoice:
          typeof resolvedChoice === 'string'
            ? resolvedChoice
            : resolvedChoice.type === 'function'
              ? `force:${resolvedChoice.function?.name}`
              : resolvedChoice.type === 'tool'
                ? `force:${resolvedChoice.name}`
                : resolvedChoice.type === 'any'
                  ? `force:${resolvedChoice.any?.name || 'unknown'}`
                  : 'unknown',
        model: config.modelName,
      })
    }
  }

  // ── Inner helpers ───────────────────────────────────────────────────────────

  /** Merges base payload + input array + caller-supplied overrides into a POST body */
  const assembleBody = (
    inputItems: ResponsesInputItem[],
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> => ({ ...sharedPayload, input: inputItems, ...overrides })

  /** Posts to the Responses API and returns the parsed response object */
  const dispatchRequest = async (
    body: Record<string, unknown>
  ): Promise<OpenAI.Responses.Response> => {
    const httpResp = await fetchFn(config.endpoint, {
      method: HTTP_POST,
      headers: config.headers,
      body: JSON.stringify(body),
    })

    if (!httpResp.ok) {
      const errMsg = await readErrorBody(httpResp)
      throw new Error(`${config.providerLabel} API error (${httpResp.status}): ${errMsg}`)
    }

    return httpResp.json()
  }

  // ── Timing bookmarks ────────────────────────────────────────────────────────

  const sessionStartMs = Date.now()
  const sessionStartISO = new Date(sessionStartMs).toISOString()

  // ── Execution ───────────────────────────────────────────────────────────────

  try {
    // ── Early streaming path (no tools) ──────────────────────────────────────

    if (request.stream && (!rawToolList || rawToolList.length === 0)) {
      logger.info(`Using streaming response for ${config.providerLabel} request`)

      const streamStart = Date.now()

      const cleanPreamble: StreamPreamble = {
        wallStart: sessionStartMs,
        wallStartISO: sessionStartISO,
        priorTokens: { input: 0, output: 0, total: 0 },
        priorCost: { input: 0, output: 0, total: 0 },
        priorSegments: [
          {
            type: 'model',
            name: SEGMENT_STREAMING_RESPONSE,
            startTime: streamStart,
            endTime: Date.now(),
            duration: Date.now() - streamStart,
          },
        ],
        priorModelMs: 0,
        priorToolMs: 0,
        firstRoundTripMs: 0,
        completedIterations: 0,
        gatheredToolCalls: [],
      }

      return buildStreamingResult(
        fetchFn,
        config.endpoint,
        config.headers,
        assembleBody(firstTurnInput, { stream: true }),
        request.model,
        cleanPreamble,
        readErrorBody,
        config.providerLabel
      )
    }

    // ── Non-streaming / tool-loop path ────────────────────────────────────────

    const firstCallMs = Date.now()
    const pinnedTools = toolBundle?.forcedTools ?? []
    let consumedPins: string[] = []
    let pinTriggered = false
    let liveResponsesChoice = activeResponsesChoice
    let liveTrackingChoice = activeTrackingChoice

    /** Updates forced-tool state based on tool calls seen in a response */
    const auditForcedTools = (
      seen: ResponsesToolCall[],
      choiceSnapshot: ActiveToolChoice | undefined
    ) => {
      if (typeof choiceSnapshot !== 'object' || seen.length === 0) return

      const audit = trackForcedToolUsage(
        seen,
        choiceSnapshot,
        logger,
        config.providerId,
        pinnedTools,
        consumedPins
      )
      pinTriggered = audit.hasUsedForcedTool
      consumedPins = audit.usedForcedTools
    }

    const conversationInput: ResponsesInputItem[] = [...firstTurnInput]
    let latestApiResponse = await dispatchRequest(
      assembleBody(conversationInput, { tool_choice: liveResponsesChoice })
    )
    const firstRoundTripMs = Date.now() - firstCallMs

    const initUsage = parseResponsesUsage(latestApiResponse.usage)
    const runningTokens = {
      input: initUsage?.promptTokens ?? 0,
      output: initUsage?.completionTokens ?? 0,
      total: initUsage?.totalTokens ?? 0,
    }

    const collectedToolCalls: FunctionCallResponse[] = []
    const collectedToolOutputs: unknown[] = []
    let loopCount = 0
    let accumulatedModelMs = firstRoundTripMs
    let accumulatedToolMs = 0
    let latestTextContent = extractResponseText(latestApiResponse.output) ?? ''

    const timingLog: TimeSegment[] = [
      {
        type: 'model',
        name: SEGMENT_INITIAL_RESPONSE,
        startTime: firstCallMs,
        endTime: firstCallMs + firstRoundTripMs,
        duration: firstRoundTripMs,
      },
    ]

    auditForcedTools(extractResponseToolCalls(latestApiResponse.output), liveTrackingChoice)

    // ── Tool-call loop ──────────────────────────────────────────────────────

    while (loopCount < MAX_TOOL_ITERATIONS) {
      const refreshedText = extractResponseText(latestApiResponse.output)
      if (refreshedText) latestTextContent = refreshedText

      const roundToolCalls = extractResponseToolCalls(latestApiResponse.output)
      if (!roundToolCalls.length) break

      const convertedOutputItems = convertResponseOutputToInputItems(latestApiResponse.output)
      if (convertedOutputItems.length) conversationInput.push(...convertedOutputItems)

      logger.info(
        `Processing ${roundToolCalls.length} tool calls in parallel (iteration ${loopCount + 1}/${MAX_TOOL_ITERATIONS})`
      )

      const batchStartMs = Date.now()

      const execPromises = roundToolCalls.map(async (invocation) => {
        const invocationStartMs = Date.now()
        const skillName = invocation.name

        try {
          const parsedArgs = invocation.arguments ? JSON.parse(invocation.arguments) : {}
          const matchedTool = request.tools?.find((t) => t.id === skillName)

          if (!matchedTool) return null

          const { toolParams, executionParams } = prepareToolExecution(
            matchedTool,
            parsedArgs,
            request
          )
          const execResult = await executeTool(skillName, executionParams)
          const invocationEndMs = Date.now()

          return {
            invocation,
            skillName,
            toolParams,
            execResult,
            startMs: invocationStartMs,
            endMs: invocationEndMs,
            elapsedMs: invocationEndMs - invocationStartMs,
          }
        } catch (execErr) {
          const invocationEndMs = Date.now()
          logger.error('Error processing tool call:', { error: execErr, toolName: skillName })

          return {
            invocation,
            skillName,
            toolParams: {},
            execResult: {
              success: false,
              output: undefined,
              error: execErr instanceof Error ? execErr.message : 'Tool execution failed',
            },
            startMs: invocationStartMs,
            endMs: invocationEndMs,
            elapsedMs: invocationEndMs - invocationStartMs,
          }
        }
      })

      const settledBatch = await Promise.allSettled(execPromises)

      for (const settled of settledBatch) {
        if (settled.status === 'rejected' || !settled.value) continue

        const { invocation, skillName, toolParams, execResult, startMs, endMs, elapsedMs } =
          settled.value

        timingLog.push({
          type: 'tool',
          name: skillName,
          startTime: startMs,
          endTime: endMs,
          duration: elapsedMs,
        })

        let outcomePayload: Record<string, unknown>
        if (execResult.success) {
          collectedToolOutputs.push(execResult.output)
          outcomePayload = execResult.output as Record<string, unknown>
        } else {
          outcomePayload = {
            error: true,
            message: execResult.error || 'Tool execution failed',
            tool: skillName,
          }
        }

        collectedToolCalls.push({
          name: skillName,
          arguments: toolParams as Record<string, unknown>,
          startTime: new Date(startMs).toISOString(),
          endTime: new Date(endMs).toISOString(),
          duration: elapsedMs,
          result: outcomePayload,
          success: execResult.success,
        })

        conversationInput.push({
          type: 'function_call_output',
          call_id: invocation.id,
          output: JSON.stringify(outcomePayload),
        })
      }

      const batchElapsedMs = Date.now() - batchStartMs
      accumulatedToolMs += batchElapsedMs

      // Advance forced-tool state if needed
      if (typeof liveResponsesChoice === 'object' && pinTriggered && pinnedTools.length > 0) {
        const unservedPins = pinnedTools.filter((p) => !consumedPins.includes(p))

        if (unservedPins.length > 0) {
          liveResponsesChoice = { type: 'function', name: unservedPins[0] }
          liveTrackingChoice = { type: 'function', function: { name: unservedPins[0] } }
          logger.info(`Forcing next tool: ${unservedPins[0]}`)
        } else {
          liveResponsesChoice = AUTO_TOOL_CHOICE
          liveTrackingChoice = AUTO_TOOL_CHOICE
          logger.info('All forced tools have been used, switching to auto tool_choice')
        }
      }

      const nextModelStartMs = Date.now()

      latestApiResponse = await dispatchRequest(
        assembleBody(conversationInput, { tool_choice: liveResponsesChoice })
      )

      auditForcedTools(extractResponseToolCalls(latestApiResponse.output), liveTrackingChoice)

      const refreshedContent = extractResponseText(latestApiResponse.output)
      if (refreshedContent) latestTextContent = refreshedContent

      const nextModelEndMs = Date.now()
      const roundModelMs = nextModelEndMs - nextModelStartMs

      timingLog.push({
        type: 'model',
        name: `Model response (iteration ${loopCount + 1})`,
        startTime: nextModelStartMs,
        endTime: nextModelEndMs,
        duration: roundModelMs,
      })

      accumulatedModelMs += roundModelMs

      const roundUsage = parseResponsesUsage(latestApiResponse.usage)
      if (roundUsage) {
        runningTokens.input += roundUsage.promptTokens
        runningTokens.output += roundUsage.completionTokens
        runningTokens.total += roundUsage.totalTokens
      }

      loopCount++
    }

    // ── Deferred format (Azure) ──────────────────────────────────────────────

    let formatWasApplied = false

    if (pendingTextFormat) {
      logger.info(
        `Applying deferred JSON schema response format for ${config.providerLabel} (iterationCount: ${loopCount})`
      )

      const fmtStartMs = Date.now()
      let fmtInput: ResponsesInputItem[]

      if (loopCount > 0) {
        const trailingItems = convertResponseOutputToInputItems(latestApiResponse.output)
        if (trailingItems.length) conversationInput.push(...trailingItems)
        fmtInput = conversationInput
      } else {
        fmtInput = firstTurnInput
      }

      const fmtPayload: Record<string, unknown> = {
        model: config.modelName,
        input: fmtInput,
        text: {
          ...((sharedPayload.text as Record<string, unknown>) ?? {}),
          format: pendingTextFormat,
        },
      }

      if (request.temperature !== undefined) fmtPayload.temperature = request.temperature
      if (request.maxTokens != null) fmtPayload.max_output_tokens = request.maxTokens
      if (request.reasoningEffort !== undefined && request.reasoningEffort !== AUTO_TOOL_CHOICE) {
        fmtPayload.reasoning = { effort: request.reasoningEffort, summary: AUTO_TOOL_CHOICE }
      }
      if (request.verbosity !== undefined && request.verbosity !== AUTO_TOOL_CHOICE) {
        fmtPayload.text = {
          ...((fmtPayload.text as Record<string, unknown>) ?? {}),
          verbosity: request.verbosity,
        }
      }

      latestApiResponse = await dispatchRequest(fmtPayload)

      const fmtEndMs = Date.now()
      const fmtElapsedMs = fmtEndMs - fmtStartMs

      timingLog.push({
        type: 'model',
        name: SEGMENT_FINAL_FORMATTED,
        startTime: fmtStartMs,
        endTime: fmtEndMs,
        duration: fmtElapsedMs,
      })

      accumulatedModelMs += fmtElapsedMs

      const fmtUsage = parseResponsesUsage(latestApiResponse.usage)
      if (fmtUsage) {
        runningTokens.input += fmtUsage.promptTokens
        runningTokens.output += fmtUsage.completionTokens
        runningTokens.total += fmtUsage.totalTokens
      }

      const fmtText = extractResponseText(latestApiResponse.output)
      if (fmtText) latestTextContent = fmtText

      formatWasApplied = true
    }

    // ── Post-tool streaming ──────────────────────────────────────────────────

    if (request.stream && !formatWasApplied) {
      logger.info('Using streaming for final response after tool processing')

      const priorCostResult = calculateCost(
        request.model,
        runningTokens.input,
        runningTokens.output
      )

      const postToolOverrides: Record<string, unknown> = {
        stream: true,
        tool_choice: AUTO_TOOL_CHOICE,
      }
      if (pendingTextFormat) {
        postToolOverrides.text = {
          ...((sharedPayload.text as Record<string, unknown>) ?? {}),
          format: pendingTextFormat,
        }
      }

      const postToolPreamble: StreamPreamble = {
        wallStart: sessionStartMs,
        wallStartISO: sessionStartISO,
        priorTokens: { ...runningTokens },
        priorCost: {
          input: priorCostResult.input,
          output: priorCostResult.output,
          total: priorCostResult.total,
        },
        priorSegments: timingLog,
        priorModelMs: accumulatedModelMs,
        priorToolMs: accumulatedToolMs,
        firstRoundTripMs: firstRoundTripMs,
        completedIterations: loopCount,
        gatheredToolCalls: collectedToolCalls,
      }

      return buildStreamingResult(
        fetchFn,
        config.endpoint,
        config.headers,
        assembleBody(conversationInput, postToolOverrides),
        request.model,
        postToolPreamble,
        readErrorBody,
        config.providerLabel
      )
    }

    // ── Non-streaming final response ─────────────────────────────────────────

    const sessionEndMs = Date.now()
    const sessionEndISO = new Date(sessionEndMs).toISOString()
    const sessionElapsedMs = sessionEndMs - sessionStartMs

    return {
      content: latestTextContent,
      model: request.model,
      tokens: runningTokens,
      toolCalls: collectedToolCalls.length > 0 ? collectedToolCalls : undefined,
      toolResults: collectedToolOutputs.length > 0 ? collectedToolOutputs : undefined,
      timing: {
        startTime: sessionStartISO,
        endTime: sessionEndISO,
        duration: sessionElapsedMs,
        modelTime: accumulatedModelMs,
        toolsTime: accumulatedToolMs,
        firstResponseTime: firstRoundTripMs,
        iterations: loopCount + 1,
        timeSegments: timingLog,
      },
    }
  } catch (runtimeErr) {
    const errMs = Date.now()
    const errISO = new Date(errMs).toISOString()
    const errElapsedMs = errMs - sessionStartMs

    logger.error(`Error in ${config.providerLabel} request:`, {
      error: runtimeErr,
      duration: errElapsedMs,
    })

    throw new ProviderError(runtimeErr instanceof Error ? runtimeErr.message : String(runtimeErr), {
      startTime: sessionStartISO,
      endTime: errISO,
      duration: errElapsedMs,
    })
  }
}

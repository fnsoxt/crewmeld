import { createLogger } from '@crewmeld/logger'
import OpenAI from 'openai'
import type { ChatCompletionCreateParamsStreaming } from 'openai/resources/chat/completions'
import { env } from '@/lib/core/config/env'
import { executeTool } from '@/lib/tools/execute-custom-skill'
import type { StreamingExecution } from '@/lib/types/execution'
import { MAX_TOOL_ITERATIONS } from '@/providers'
import { getProviderDefaultModel, getProviderModels } from '@/providers/models'
import type {
  FunctionCallResponse,
  Message,
  ProviderConfig,
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
import { createReadableStreamFromVLLMStream } from '@/providers/vllm/utils'
import { useProvidersStore } from '@/stores/providers'

// ── Module logger ──────────────────────────────────────────────────────────────

const log = createLogger('VLLMProvider')

// ── Provider constants ────────────────────────────────────────────────────────

/** Version string reported in the provider manifest */
const VLLM_MANIFEST_VERSION = '1.0.0'

/** API key used when the user has not configured one (vLLM ignores it) */
const VLLM_FALLBACK_API_KEY = 'empty'

/** Prefix stripped from CrewMeld model identifiers before forwarding to vLLM */
const VLLM_MODEL_ID_PREFIX = 'vllm/'

/** Pattern stripped from JSON-schema formatted vLLM response text */
const JSON_FENCE_RE = /```json\n?|\n?```/g

/** Stable provider ID string used for tool-tracking calls */
const VLLM_PROVIDER_ID = 'vllm' as const

/** Authorization header prefix */
const BEARER_PREFIX = 'Bearer'

/** Content-Type header value for JSON requests */
const JSON_CONTENT_TYPE = 'application/json'

/** Time-segment label for the initial model round-trip */
const SEGMENT_INITIAL = 'Initial response'

/** Time-segment label for the early streaming (no-tool) path */
const SEGMENT_STREAM_EARLY = 'Streaming response'

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Strips Markdown JSON code fences from a vLLM completion string, when the
 * caller has requested JSON-schema output formatting.
 *
 * @param raw - Raw text from a vLLM chat completion choice
 * @param applyClean - Whether to apply the fence-stripping transformation
 * @returns Cleaned string, or the original if no transformation is needed
 */
function maybeCleanJsonFences(raw: string, applyClean: boolean): string {
  return applyClean ? raw.replace(JSON_FENCE_RE, '').trim() : raw
}

/**
 * Builds an authenticated OpenAI-compat client pointing at the vLLM `/v1` endpoint.
 *
 * @param baseUrl - The vLLM service base URL (trailing slash already removed)
 * @param apiKey  - API key; uses the fallback placeholder when absent
 * @returns Ready-to-use `OpenAI` instance
 */
function buildVllmClient(baseUrl: string, apiKey: string): OpenAI {
  return new OpenAI({ apiKey, baseURL: `${baseUrl}/v1` })
}

// ── Provider definition ────────────────────────────────────────────────────────

/**
 * CrewMeld vLLM provider.
 *
 * Wraps a self-hosted vLLM inference server behind the OpenAI Chat Completions
 * compatibility shim. Supports tool-call loops (with forced-tool sequencing),
 * streaming, and JSON-schema response formatting.
 */
export const vllmProvider: ProviderConfig = {
  id: VLLM_PROVIDER_ID,
  name: 'vLLM',
  description: 'Self-hosted vLLM with OpenAI-compatible API',
  version: VLLM_MANIFEST_VERSION,
  models: getProviderModels('vllm'),
  defaultModel: getProviderDefaultModel('vllm'),

  // ── Initialisation ───────────────────────────────────────────────────────────

  async initialize() {
    if (typeof window !== 'undefined') {
      log.info('Skipping vLLM initialization on client side to avoid CORS issues')
      return
    }

    const serviceUrl = (env.VLLM_BASE_URL || '').replace(/\/$/, '')
    if (!serviceUrl) {
      log.info('VLLM_BASE_URL not configured, skipping initialization')
      return
    }

    try {
      const initHeaders: Record<string, string> = { 'Content-Type': JSON_CONTENT_TYPE }
      if (env.VLLM_API_KEY) initHeaders.Authorization = `${BEARER_PREFIX} ${env.VLLM_API_KEY}`

      const catalogResp = await fetch(`${serviceUrl}/v1/models`, { headers: initHeaders })
      if (!catalogResp.ok) {
        useProvidersStore.getState().setProviderModels('vllm', [])
        log.warn('vLLM service is not available. The provider will be disabled.')
        return
      }

      const catalogData = (await catalogResp.json()) as { data: Array<{ id: string }> }
      const discoveredModels = catalogData.data.map((m) => `${VLLM_MODEL_ID_PREFIX}${m.id}`)

      this.models = discoveredModels
      useProvidersStore.getState().setProviderModels('vllm', discoveredModels)
      log.info(`Discovered ${discoveredModels.length} vLLM model(s):`, { models: discoveredModels })
    } catch (initErr) {
      log.warn('vLLM model instantiation failed. The provider will be disabled.', {
        error: initErr instanceof Error ? initErr.message : 'Unknown error',
      })
    }
  },

  // ── Request execution ────────────────────────────────────────────────────────

  executeRequest: async (
    request: ProviderRequest
  ): Promise<ProviderResponse | StreamingExecution> => {
    log.info('Preparing vLLM request', {
      model: request.model,
      hasSystemPrompt: !!request.systemPrompt,
      hasMessages: !!request.messages?.length,
      hasTools: !!request.tools?.length,
      toolCount: request.tools?.length ?? 0,
      hasResponseFormat: !!request.responseFormat,
      stream: !!request.stream,
    })

    // ── Client allocation ────────────────────────────────────────────────────

    const serviceBaseUrl = (
      (request as ProviderRequest & { azureEndpoint?: string }).azureEndpoint ||
      env.VLLM_BASE_URL ||
      ''
    ).replace(/\/$/, '')

    if (!serviceBaseUrl) throw new Error('VLLM_BASE_URL is required for vLLM provider')

    const resolvedApiKey = request.apiKey || env.VLLM_API_KEY || VLLM_FALLBACK_API_KEY
    const vllmClient = buildVllmClient(serviceBaseUrl, resolvedApiKey)

    // ── Message assembly ─────────────────────────────────────────────────────

    const conversationHistory: Message[] = []

    if (request.systemPrompt)
      conversationHistory.push({ role: 'system', content: request.systemPrompt })
    if (request.context) conversationHistory.push({ role: 'user', content: request.context })
    if (request.messages) conversationHistory.push(...request.messages)

    // ── Tool list ────────────────────────────────────────────────────────────

    const declaredTools = request.tools?.length
      ? request.tools.map((t) => ({
          type: 'function',
          function: { name: t.id, description: t.description, parameters: t.parameters },
        }))
      : undefined

    // ── Base payload ─────────────────────────────────────────────────────────

    // biome-ignore lint/suspicious/noExplicitAny: vLLM payload shape is flexible
    const baseBody: any = {
      model: request.model.replace(new RegExp(`^${VLLM_MODEL_ID_PREFIX}`), ''),
      messages: conversationHistory,
    }

    if (request.temperature !== undefined) baseBody.temperature = request.temperature
    if (request.maxTokens != null) baseBody.max_completion_tokens = request.maxTokens

    const formatEnabled = !!request.responseFormat
    if (formatEnabled) {
      baseBody.response_format = {
        type: 'json_schema',
        json_schema: {
          name: request.responseFormat!.name || 'response_schema',
          schema: request.responseFormat!.schema || request.responseFormat,
          strict: request.responseFormat!.strict !== false,
        },
      }
      log.info('Added JSON schema response format to vLLM request')
    }

    // ── Tool preparation ─────────────────────────────────────────────────────

    type PreparedTools = ReturnType<typeof prepareToolsWithUsageControl>
    let toolBundle: PreparedTools | null = null
    let toolsAreActive = false

    if (declaredTools?.length) {
      toolBundle = prepareToolsWithUsageControl(declaredTools, request.tools, log, VLLM_PROVIDER_ID)
      const { tools: filteredList, toolChoice: resolvedChoice } = toolBundle

      if (filteredList?.length && resolvedChoice) {
        baseBody.tools = filteredList
        baseBody.tool_choice = resolvedChoice
        toolsAreActive = true

        log.info('vLLM request configuration:', {
          toolCount: filteredList.length,
          toolChoice:
            typeof resolvedChoice === 'string'
              ? resolvedChoice
              : resolvedChoice.type === 'function'
                ? `force:${resolvedChoice.function?.name}`
                : 'unknown',
          model: baseBody.model,
        })
      }
    }

    // ── Timing bookmark ──────────────────────────────────────────────────────

    const sessionStartMs = Date.now()
    const sessionStartISO = new Date(sessionStartMs).toISOString()

    // ── Execution ────────────────────────────────────────────────────────────

    try {
      // ── Early streaming (no tools) ──────────────────────────────────────

      if (request.stream && (!declaredTools?.length || !toolsAreActive)) {
        log.info('Using streaming response for vLLM request')

        const earlyStreamParams: ChatCompletionCreateParamsStreaming = {
          ...baseBody,
          stream: true,
          stream_options: { include_usage: true },
        }
        const earlyStream = await vllmClient.chat.completions.create(earlyStreamParams)

        const earlyEnvelope = {
          stream: createReadableStreamFromVLLMStream(earlyStream, (streamedText, usageTally) => {
            const cleanedText = streamedText
              ? maybeCleanJsonFences(streamedText, formatEnabled)
              : streamedText

            earlyEnvelope.execution.output.content = cleanedText
            earlyEnvelope.execution.output.tokens = {
              input: usageTally.prompt_tokens,
              output: usageTally.completion_tokens,
              total: usageTally.total_tokens,
            }

            const streamCost = calculateCost(
              request.model,
              usageTally.prompt_tokens,
              usageTally.completion_tokens
            )
            earlyEnvelope.execution.output.cost = {
              input: streamCost.input,
              output: streamCost.output,
              total: streamCost.total,
            }

            const finishMs = Date.now()
            const finishISO = new Date(finishMs).toISOString()

            if (earlyEnvelope.execution.output.providerTiming) {
              earlyEnvelope.execution.output.providerTiming.endTime = finishISO
              earlyEnvelope.execution.output.providerTiming.duration = finishMs - sessionStartMs

              const firstSeg = earlyEnvelope.execution.output.providerTiming.timeSegments?.[0]
              if (firstSeg) {
                firstSeg.endTime = finishMs
                firstSeg.duration = finishMs - sessionStartMs
              }
            }
          }),
          execution: {
            success: true,
            output: {
              content: '',
              model: request.model,
              tokens: { input: 0, output: 0, total: 0 },
              toolCalls: undefined,
              providerTiming: {
                startTime: sessionStartISO,
                endTime: new Date().toISOString(),
                duration: Date.now() - sessionStartMs,
                timeSegments: [
                  {
                    type: 'model',
                    name: SEGMENT_STREAM_EARLY,
                    startTime: sessionStartMs,
                    endTime: Date.now(),
                    duration: Date.now() - sessionStartMs,
                  },
                ],
              },
              cost: { input: 0, output: 0, total: 0 },
            },
            logs: [],
            metadata: {
              startTime: sessionStartISO,
              endTime: new Date().toISOString(),
              duration: Date.now() - sessionStartMs,
            },
          },
        } as StreamingExecution

        return earlyEnvelope
      }

      // ── Non-streaming / tool-loop ─────────────────────────────────────────

      const firstCallMs = Date.now()
      const originalToolChoice = baseBody.tool_choice
      const pinnedTools = toolBundle?.forcedTools ?? []
      let consumedPins: string[] = []
      let pinTriggered = false

      /** Audit forced-tool state after each model response */
      // biome-ignore lint/suspicious/noExplicitAny: vLLM response type is runtime-wide
      const auditForcedTools = (resp: any, choiceSnapshot: unknown) => {
        if (typeof choiceSnapshot === 'object' && resp.choices?.[0]?.message?.tool_calls) {
          const seenCalls = resp.choices[0].message.tool_calls
          const audit = trackForcedToolUsage(
            seenCalls,
            choiceSnapshot as Parameters<typeof trackForcedToolUsage>[1],
            log,
            VLLM_PROVIDER_ID,
            pinnedTools,
            consumedPins
          )
          pinTriggered = audit.hasUsedForcedTool
          consumedPins = audit.usedForcedTools
        }
      }

      let latestCompletion = await vllmClient.chat.completions.create({
        ...baseBody,
        stream: false,
      })
      const firstRoundTripMs = Date.now() - firstCallMs

      let latestContent = latestCompletion.choices[0]?.message?.content ?? ''
      if (latestContent && formatEnabled) latestContent = maybeCleanJsonFences(latestContent, true)

      const runningTokens = {
        input: latestCompletion.usage?.prompt_tokens ?? 0,
        output: latestCompletion.usage?.completion_tokens ?? 0,
        total: latestCompletion.usage?.total_tokens ?? 0,
      }

      const gatheredCalls: FunctionCallResponse[] = []
      const gatheredOutputs: unknown[] = []
      const dialogueHistory = [...conversationHistory]
      let loopCount = 0
      let accModelMs = firstRoundTripMs
      let accToolMs = 0

      const timingSegments: TimeSegment[] = [
        {
          type: 'model',
          name: SEGMENT_INITIAL,
          startTime: firstCallMs,
          endTime: firstCallMs + firstRoundTripMs,
          duration: firstRoundTripMs,
        },
      ]

      auditForcedTools(latestCompletion, originalToolChoice)

      // ── Tool-call loop ───────────────────────────────────────────────────

      while (loopCount < MAX_TOOL_ITERATIONS) {
        const iterText = latestCompletion.choices[0]?.message?.content
        if (iterText) {
          latestContent = maybeCleanJsonFences(iterText, formatEnabled)
        }

        const pendingCalls = latestCompletion.choices[0]?.message?.tool_calls
        if (!pendingCalls?.length) break

        log.info(
          `Processing ${pendingCalls.length} tool calls (iteration ${loopCount + 1}/${MAX_TOOL_ITERATIONS})`
        )

        const batchStartMs = Date.now()

        const invocationPromises = pendingCalls.map(async (invocation) => {
          const invStartMs = Date.now()
          const skillId = invocation.function.name

          try {
            const parsedArgs = JSON.parse(invocation.function.arguments)
            const matchedTool = request.tools?.find((t) => t.id === skillId)
            if (!matchedTool) return null

            const { toolParams, executionParams } = prepareToolExecution(
              matchedTool,
              parsedArgs,
              request
            )
            const execResult = await executeTool(skillId, executionParams)
            const invEndMs = Date.now()

            return {
              invocation,
              skillId,
              toolParams,
              execResult,
              startMs: invStartMs,
              endMs: invEndMs,
              elapsedMs: invEndMs - invStartMs,
            }
          } catch (execErr) {
            const invEndMs = Date.now()
            log.error('Error processing tool call:', { error: execErr, toolName: skillId })

            return {
              invocation,
              skillId,
              toolParams: {},
              execResult: {
                success: false,
                output: undefined,
                error: execErr instanceof Error ? execErr.message : 'Tool execution failed',
              },
              startMs: invStartMs,
              endMs: invEndMs,
              elapsedMs: invEndMs - invStartMs,
            }
          }
        })

        const settledBatch = await Promise.allSettled(invocationPromises)

        dialogueHistory.push({
          role: 'assistant',
          content: null as unknown as string,
          tool_calls: pendingCalls.map((c) => ({
            id: c.id,
            type: 'function' as const,
            function: { name: c.function.name, arguments: c.function.arguments },
          })),
        } as Message)

        for (const settled of settledBatch) {
          if (settled.status === 'rejected' || !settled.value) continue

          const { invocation, skillId, toolParams, execResult, startMs, endMs, elapsedMs } =
            settled.value

          timingSegments.push({
            type: 'tool',
            name: skillId,
            startTime: startMs,
            endTime: endMs,
            duration: elapsedMs,
          })

          let outcomePayload: Record<string, unknown>
          if (execResult.success) {
            gatheredOutputs.push(execResult.output)
            outcomePayload = execResult.output as Record<string, unknown>
          } else {
            outcomePayload = {
              error: true,
              message: execResult.error || 'Tool execution failed',
              tool: skillId,
            }
          }

          gatheredCalls.push({
            name: skillId,
            arguments: toolParams as Record<string, unknown>,
            startTime: new Date(startMs).toISOString(),
            endTime: new Date(endMs).toISOString(),
            duration: elapsedMs,
            result: outcomePayload,
            success: execResult.success,
          })

          dialogueHistory.push({
            role: 'tool',
            tool_call_id: invocation.id,
            content: JSON.stringify(outcomePayload),
          } as Message)
        }

        const batchElapsedMs = Date.now() - batchStartMs
        accToolMs += batchElapsedMs

        const followUpBody: Record<string, unknown> = { ...baseBody, messages: dialogueHistory }

        if (typeof originalToolChoice === 'object' && pinTriggered && pinnedTools.length > 0) {
          const unservedPins = pinnedTools.filter((p) => !consumedPins.includes(p))

          if (unservedPins.length > 0) {
            followUpBody.tool_choice = { type: 'function', function: { name: unservedPins[0] } }
            log.info(`Forcing next tool: ${unservedPins[0]}`)
          } else {
            followUpBody.tool_choice = 'auto'
            log.info('All forced tools have been used, switching to auto tool_choice')
          }
        }

        const nextRoundStartMs = Date.now()

        // biome-ignore lint/suspicious/noExplicitAny: followUpBody is runtime-built
        latestCompletion = await vllmClient.chat.completions.create({
          ...(followUpBody as any),
          stream: false,
        })

        auditForcedTools(latestCompletion, followUpBody.tool_choice)

        const nextRoundEndMs = Date.now()
        const roundModelMs = nextRoundEndMs - nextRoundStartMs

        timingSegments.push({
          type: 'model',
          name: `Model response (iteration ${loopCount + 1})`,
          startTime: nextRoundStartMs,
          endTime: nextRoundEndMs,
          duration: roundModelMs,
        })

        accModelMs += roundModelMs

        const roundText = latestCompletion.choices[0]?.message?.content
        if (roundText) latestContent = maybeCleanJsonFences(roundText, formatEnabled)

        if (latestCompletion.usage) {
          runningTokens.input += latestCompletion.usage.prompt_tokens ?? 0
          runningTokens.output += latestCompletion.usage.completion_tokens ?? 0
          runningTokens.total += latestCompletion.usage.total_tokens ?? 0
        }

        loopCount++
      }

      // ── Post-tool streaming ───────────────────────────────────────────────

      if (request.stream) {
        log.info('Using streaming for final response after tool processing')

        const priorCost = calculateCost(request.model, runningTokens.input, runningTokens.output)

        const postToolParams: ChatCompletionCreateParamsStreaming = {
          ...baseBody,
          messages: dialogueHistory,
          tool_choice: 'auto',
          stream: true,
          stream_options: { include_usage: true },
        }
        const postToolStream = await vllmClient.chat.completions.create(postToolParams)

        const lateEnvelope = {
          stream: createReadableStreamFromVLLMStream(postToolStream, (streamedText, usageTally) => {
            const cleanedText = streamedText
              ? maybeCleanJsonFences(streamedText, formatEnabled)
              : streamedText

            lateEnvelope.execution.output.content = cleanedText
            lateEnvelope.execution.output.tokens = {
              input: runningTokens.input + usageTally.prompt_tokens,
              output: runningTokens.output + usageTally.completion_tokens,
              total: runningTokens.total + usageTally.total_tokens,
            }

            const streamCost = calculateCost(
              request.model,
              usageTally.prompt_tokens,
              usageTally.completion_tokens
            )
            lateEnvelope.execution.output.cost = {
              input: priorCost.input + streamCost.input,
              output: priorCost.output + streamCost.output,
              total: priorCost.total + streamCost.total,
            }
          }),
          execution: {
            success: true,
            output: {
              content: '',
              model: request.model,
              tokens: { ...runningTokens },
              toolCalls:
                gatheredCalls.length > 0
                  ? { list: gatheredCalls, count: gatheredCalls.length }
                  : undefined,
              providerTiming: {
                startTime: sessionStartISO,
                endTime: new Date().toISOString(),
                duration: Date.now() - sessionStartMs,
                modelTime: accModelMs,
                toolsTime: accToolMs,
                firstResponseTime: firstRoundTripMs,
                iterations: loopCount + 1,
                timeSegments: timingSegments,
              },
              cost: {
                input: priorCost.input,
                output: priorCost.output,
                total: priorCost.total,
              },
            },
            logs: [],
            metadata: {
              startTime: sessionStartISO,
              endTime: new Date().toISOString(),
              duration: Date.now() - sessionStartMs,
            },
          },
        } as StreamingExecution

        return lateEnvelope
      }

      // ── Non-streaming final response ──────────────────────────────────────

      const sessionEndMs = Date.now()
      const sessionEndISO = new Date(sessionEndMs).toISOString()
      const sessionElapsedMs = sessionEndMs - sessionStartMs

      return {
        content: latestContent,
        model: request.model,
        tokens: runningTokens,
        toolCalls: gatheredCalls.length > 0 ? gatheredCalls : undefined,
        toolResults: gatheredOutputs.length > 0 ? gatheredOutputs : undefined,
        timing: {
          startTime: sessionStartISO,
          endTime: sessionEndISO,
          duration: sessionElapsedMs,
          modelTime: accModelMs,
          toolsTime: accToolMs,
          firstResponseTime: firstRoundTripMs,
          iterations: loopCount + 1,
          timeSegments: timingSegments,
        },
      }
    } catch (runtimeErr) {
      const errMs = Date.now()
      const errISO = new Date(errMs).toISOString()
      const errElapsedMs = errMs - sessionStartMs

      let errMsg = runtimeErr instanceof Error ? runtimeErr.message : String(runtimeErr)
      let errType: string | undefined
      let errCode: number | undefined

      if (runtimeErr && typeof runtimeErr === 'object' && 'error' in runtimeErr) {
        // biome-ignore lint/suspicious/noExplicitAny: vLLM error shape is runtime-defined
        const vllmErr = (runtimeErr as any).error
        if (vllmErr && typeof vllmErr === 'object') {
          errMsg = vllmErr.message || errMsg
          errType = vllmErr.type
          errCode = vllmErr.code
        }
      }

      log.error('Error in vLLM request:', {
        error: errMsg,
        errorType: errType,
        errorCode: errCode,
        duration: errElapsedMs,
      })

      throw new ProviderError(errMsg, {
        startTime: sessionStartISO,
        endTime: errISO,
        duration: errElapsedMs,
      })
    }
  },
}

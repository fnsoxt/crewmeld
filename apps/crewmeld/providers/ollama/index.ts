import { createLogger } from '@crewmeld/logger'
import OpenAI from 'openai'
import type { ChatCompletionCreateParamsStreaming } from 'openai/resources/chat/completions'
import { env } from '@/lib/core/config/env'
import { executeTool } from '@/lib/tools/execute-custom-skill'
import type { StreamingExecution } from '@/lib/types/execution'
import { MAX_TOOL_ITERATIONS } from '@/providers'
import type { ModelsObject } from '@/providers/ollama/types'
import { createReadableStreamFromOllamaStream } from '@/providers/ollama/utils'
import type {
  FunctionCallResponse,
  ProviderConfig,
  ProviderRequest,
  ProviderResponse,
  TimeSegment,
} from '@/providers/types'
import { ProviderError } from '@/providers/types'
import { calculateCost, prepareToolExecution } from '@/providers/utils'
import { useProvidersStore } from '@/stores/providers'

// ── Module logger ──────────────────────────────────────────────────────────────

const log = createLogger('OllamaProvider')

// ── Provider constants ────────────────────────────────────────────────────────

/** Default base URL for the local Ollama service */
const OLLAMA_BASE_URL = env.OLLAMA_URL || 'http://localhost:11434'

/** API key placeholder — Ollama does not require authentication */
const OLLAMA_DUMMY_API_KEY = 'empty'

/** JSON fence pattern stripped from Ollama model output */
const JSON_FENCE_PATTERN = /```json\n?|\n?```/g

/** Tool-choice value passed to the Ollama Chat Completions endpoint */
const OLLAMA_TOOL_CHOICE = 'auto' as const

/** Log message emitted when an Ollama streaming request is dispatched */
const LOG_STREAMING_INIT = 'Using streaming response for Ollama request'

/** Log message emitted when switching to streaming after tool processing */
const LOG_STREAMING_POST_TOOL = 'Using streaming for final response after tool processing'

/** Time-segment label for the initial model round-trip */
const SEGMENT_INITIAL = 'Initial response'

/** Time-segment label for the early streaming (no-tool) path */
const SEGMENT_STREAM_EARLY = 'Streaming response'

/** Window-context check string */
const BROWSER_CONTEXT_TYPE = 'undefined'

// ── Content sanitiser ──────────────────────────────────────────────────────────

/**
 * Strips Markdown JSON code fences from a raw Ollama completion string and
 * trims surrounding whitespace.
 *
 * @param raw - The raw text content from an Ollama chat completion choice
 * @returns Cleaned content string
 */
function stripJsonFences(raw: string): string {
  return raw.replace(JSON_FENCE_PATTERN, '').trim()
}

// ── Client factory ─────────────────────────────────────────────────────────────

/**
 * Allocates an OpenAI-compat client pointed at the local Ollama v1 endpoint.
 *
 * @returns Configured `OpenAI` instance for Ollama
 */
function buildOllamaClient(): OpenAI {
  return new OpenAI({
    apiKey: OLLAMA_DUMMY_API_KEY,
    baseURL: `${OLLAMA_BASE_URL}/v1`,
  })
}

// ── Tool filter helpers ────────────────────────────────────────────────────────

/**
 * Filters out tools whose `usageControl` is `'none'` (disabled).
 *
 * @param rawTools - Full tool list in Chat Completions format
 * @param toolConfigs - Original tool configs carrying `usageControl`
 * @returns Subset of tools that should be sent to the model
 */
function filterEnabledTools(
  rawTools: Array<{ type: string; function: { name: string } }>,
  toolConfigs: ProviderRequest['tools']
): typeof rawTools {
  return rawTools.filter((t) => {
    const cfg = toolConfigs?.find((c) => c.id === t.function.name)
    return cfg?.usageControl !== 'none'
  })
}

/**
 * Returns `true` when any tool in the list is configured with `usageControl = 'force'`.
 * Ollama ignores `tool_choice` so forced tools fall back to auto-selection.
 *
 * @param rawTools - Full tool list in Chat Completions format
 * @param toolConfigs - Original tool configs carrying `usageControl`
 */
function hasForcedToolConfig(
  rawTools: Array<{ type: string; function: { name: string } }>,
  toolConfigs: ProviderRequest['tools']
): boolean {
  return rawTools.some((t) => {
    const cfg = toolConfigs?.find((c) => c.id === t.function.name)
    return cfg?.usageControl === 'force'
  })
}

// ── Provider definition ────────────────────────────────────────────────────────

/**
 * CrewMeld Ollama provider.
 *
 * Wraps the local Ollama HTTP service behind the OpenAI Chat Completions
 * compatibility shim (`/v1`). Supports tool-call loops, streaming, and JSON
 * schema response formatting. Forced-tool selection is not supported by
 * Ollama and degrades silently to automatic selection.
 */
export const ollamaProvider: ProviderConfig = {
  id: 'ollama',
  name: 'Ollama',
  description: 'Local Ollama server for LLM inference',
  version: '1.0.0',
  models: [],
  defaultModel: '',

  // ── Initialisation ───────────────────────────────────────────────────────────

  async initialize() {
    if (typeof window !== BROWSER_CONTEXT_TYPE) {
      log.info('Skipping Ollama initialization on client side to avoid CORS issues')
      return
    }

    try {
      const tagsResp = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
      if (!tagsResp.ok) {
        useProvidersStore.getState().setProviderModels('ollama', [])
        log.warn('Ollama service is not available. The provider will be disabled.')
        return
      }
      const catalogue = (await tagsResp.json()) as ModelsObject
      this.models = catalogue.models.map((m) => m.name)
      useProvidersStore.getState().setProviderModels('ollama', this.models)
    } catch (initErr) {
      log.warn('Ollama model instantiation failed. The provider will be disabled.', {
        error: initErr instanceof Error ? initErr.message : 'Unknown error',
      })
    }
  },

  // ── Request execution ────────────────────────────────────────────────────────

  executeRequest: async (
    request: ProviderRequest
  ): Promise<ProviderResponse | StreamingExecution> => {
    log.info('Preparing Ollama request', {
      model: request.model,
      hasSystemPrompt: !!request.systemPrompt,
      hasMessages: !!request.messages?.length,
      hasTools: !!request.tools?.length,
      toolCount: request.tools?.length ?? 0,
      hasResponseFormat: !!request.responseFormat,
      stream: !!request.stream,
    })

    const ollamaClient = buildOllamaClient()

    // ── Message assembly ─────────────────────────────────────────────────────

    // biome-ignore lint/suspicious/noExplicitAny: OpenAI SDK chat message union is wide
    const conversationHistory: any[] = []

    if (request.systemPrompt) {
      conversationHistory.push({ role: 'system', content: request.systemPrompt })
    }

    if (request.context) {
      conversationHistory.push({ role: 'user', content: request.context })
    }

    if (request.messages) {
      conversationHistory.push(...request.messages)
    }

    // ── Tool list ────────────────────────────────────────────────────────────

    const declaredTools = request.tools?.length
      ? request.tools.map((t) => ({
          type: 'function',
          function: { name: t.id, description: t.description, parameters: t.parameters },
        }))
      : undefined

    // ── Base payload ─────────────────────────────────────────────────────────

    // biome-ignore lint/suspicious/noExplicitAny: payload shape matched at runtime via Ollama compat layer
    const baseBody: any = {
      model: request.model,
      messages: conversationHistory,
    }

    if (request.temperature !== undefined) baseBody.temperature = request.temperature
    if (request.maxTokens != null) baseBody.max_tokens = request.maxTokens

    if (request.responseFormat) {
      baseBody.response_format = {
        type: 'json_schema',
        json_schema: {
          name: request.responseFormat.name || 'response_schema',
          schema: request.responseFormat.schema || request.responseFormat,
          strict: request.responseFormat.strict !== false,
        },
      }
      log.info('Added JSON schema response format to Ollama request')
    }

    if (declaredTools?.length) {
      const enabledTools = filterEnabledTools(declaredTools, request.tools)
      const forcedDeclared = hasForcedToolConfig(declaredTools, request.tools)

      if (forcedDeclared) {
        log.warn(
          'Ollama does not support forced tool selection (tool_choice parameter is ignored). ' +
            'Tools marked with usageControl="force" will behave as "auto" instead.'
        )
      }

      if (enabledTools.length) {
        baseBody.tools = enabledTools
        baseBody.tool_choice = OLLAMA_TOOL_CHOICE

        log.info('Ollama request configuration:', {
          toolCount: enabledTools.length,
          toolChoice: OLLAMA_TOOL_CHOICE,
          forcedToolsIgnored: forcedDeclared,
          model: request.model,
        })
      }
    }

    // ── Timing ───────────────────────────────────────────────────────────────

    const sessionStartMs = Date.now()
    const sessionStartISO = new Date(sessionStartMs).toISOString()

    // ── Execution ────────────────────────────────────────────────────────────

    try {
      // ── Early streaming (no tools) ──────────────────────────────────────

      if (request.stream && (!declaredTools || declaredTools.length === 0)) {
        log.info(LOG_STREAMING_INIT)

        const streamParams: ChatCompletionCreateParamsStreaming = {
          ...baseBody,
          stream: true,
          stream_options: { include_usage: true },
        }
        const rawStream = await ollamaClient.chat.completions.create(streamParams)

        const earlyEnvelope = {
          stream: createReadableStreamFromOllamaStream(rawStream, (streamedText, usageTally) => {
            earlyEnvelope.execution.output.content = streamedText
              ? stripJsonFences(streamedText)
              : streamedText

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
      let latestCompletion = await ollamaClient.chat.completions.create({
        ...baseBody,
        stream: false,
      })
      const firstRoundTripMs = Date.now() - firstCallMs

      let latestContent = latestCompletion.choices[0]?.message?.content ?? ''
      if (latestContent) latestContent = stripJsonFences(latestContent)

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

      // ── Tool-call loop ───────────────────────────────────────────────────

      while (loopCount < MAX_TOOL_ITERATIONS) {
        const iterText = latestCompletion.choices[0]?.message?.content
        if (iterText) latestContent = iterText

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

        const settledInvocations = await Promise.allSettled(invocationPromises)

        dialogueHistory.push({
          role: 'assistant',
          content: null,
          tool_calls: pendingCalls.map((c) => ({
            id: c.id,
            type: 'function',
            function: { name: c.function.name, arguments: c.function.arguments },
          })),
        })

        for (const settled of settledInvocations) {
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
          })
        }

        const batchElapsedMs = Date.now() - batchStartMs
        accToolMs += batchElapsedMs

        const nextRoundStartMs = Date.now()

        latestCompletion = await ollamaClient.chat.completions.create({
          ...baseBody,
          messages: dialogueHistory,
          stream: false,
        })

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

        const followUpText = latestCompletion.choices[0]?.message?.content
        if (followUpText) latestContent = stripJsonFences(followUpText)

        if (latestCompletion.usage) {
          runningTokens.input += latestCompletion.usage.prompt_tokens ?? 0
          runningTokens.output += latestCompletion.usage.completion_tokens ?? 0
          runningTokens.total += latestCompletion.usage.total_tokens ?? 0
        }

        loopCount++
      }

      // ── Post-tool streaming ───────────────────────────────────────────────

      if (request.stream) {
        log.info(LOG_STREAMING_POST_TOOL)

        const priorCost = calculateCost(request.model, runningTokens.input, runningTokens.output)

        const postToolParams: ChatCompletionCreateParamsStreaming = {
          ...baseBody,
          messages: dialogueHistory,
          tool_choice: OLLAMA_TOOL_CHOICE,
          stream: true,
          stream_options: { include_usage: true },
        }
        const postToolStream = await ollamaClient.chat.completions.create(postToolParams)

        const lateEnvelope = {
          stream: createReadableStreamFromOllamaStream(
            postToolStream,
            (streamedText, usageTally) => {
              lateEnvelope.execution.output.content = streamedText
                ? stripJsonFences(streamedText)
                : streamedText

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
            }
          ),
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

      log.error('Error in Ollama request:', { error: runtimeErr, duration: errElapsedMs })

      throw new ProviderError(
        runtimeErr instanceof Error ? runtimeErr.message : String(runtimeErr),
        { startTime: sessionStartISO, endTime: errISO, duration: errElapsedMs }
      )
    }
  },
}

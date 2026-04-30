/**
 * Chat-completions engine for OpenAI-compatible endpoints.
 *
 * Implements the full request lifecycle: endpoint validation, message assembly,
 * tool setup, streaming paths, and the tool-call iteration loop.
 * Exported as a class so the thin public entry-point (compatible.ts) stays minimal.
 */

// ── Internal ──────────────────────────────────────────────────────────────────
import { createLogger } from '@crewmeld/logger'
// ── Third-party ───────────────────────────────────────────────────────────────
import OpenAI from 'openai'
import type { ChatCompletionCreateParamsStreaming } from 'openai/resources/chat/completions'
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
  createOpenAICompatibleStream,
  prepareToolExecution,
  prepareToolsWithUsageControl,
  trackForcedToolUsage,
} from '@/providers/utils'

// ── Module constants ──────────────────────────────────────────────────────────

const log = createLogger('OpenAICompatibleProvider')

/** Strips markdown JSON fences that some models emit around structured output. */
const FENCE_RE = /```json\n?|\n?```/g

// ── Internal types ────────────────────────────────────────────────────────────

/** Mutable accumulator for token counts across multiple API calls. */
interface TokenAccum {
  input: number
  output: number
  total: number
}

/** Result of executing one tool call. */
interface ToolOutcome {
  // biome-ignore lint/suspicious/noExplicitAny: SDK tool call shape
  call: any
  name: string
  params: Record<string, unknown>
  output: { success: boolean; value?: unknown; error?: string }
  t0: number
  t1: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Derive a `/v1`-suffixed base URL from the caller's raw endpoint string.
 * Throws if the endpoint is absent.
 */
function deriveBaseURL(req: ProviderRequest): string {
  const raw = (req as ProviderRequest & { apiEndpoint?: string }).apiEndpoint ?? ''
  const stripped = raw.replace(/\/$/, '')
  if (!stripped) throw new Error('OpenAI 兼容模式需要 apiEndpoint，但未提供')
  return stripped.endsWith('/v1') ? stripped : `${stripped}/v1`
}

/**
 * Collapse system prompt + context + history into a single ordered array.
 */
function assembleConversation(req: ProviderRequest): Message[] {
  const out: Message[] = []
  if (req.systemPrompt) out.push({ role: 'system', content: req.systemPrompt })
  if (req.context) out.push({ role: 'user', content: req.context })
  if (req.messages?.length) out.push(...req.messages)
  return out
}

/**
 * Strip markdown JSON fences when structured output is requested.
 */
function sanitise(text: string, structured: boolean): string {
  return structured ? text.replace(FENCE_RE, '').trim() : text
}

/**
 * Absorb one usage snapshot into the running total.
 */
function accumUsage(
  acc: TokenAccum,
  u: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
): void {
  acc.input += u.prompt_tokens ?? 0
  acc.output += u.completion_tokens ?? 0
  acc.total += u.total_tokens ?? 0
}

/**
 * Invoke every tool call in the current response concurrently.
 * Returns settled outcomes in the same order.
 */
// biome-ignore lint/suspicious/noExplicitAny: SDK response shape
async function invokeTools(calls: any[], req: ProviderRequest): Promise<ToolOutcome[]> {
  const pending = calls.map(async (call): Promise<ToolOutcome> => {
    const t0 = Date.now()
    const name: string = call.function.name
    try {
      const args = JSON.parse(call.function.arguments) as Record<string, unknown>
      const descriptor = req.tools?.find((d) => d.id === name)
      if (!descriptor) {
        return {
          call,
          name,
          params: {},
          output: { success: false, error: 'Tool not found' },
          t0,
          t1: Date.now(),
        }
      }
      const { toolParams: params, executionParams } = prepareToolExecution(descriptor, args, req)
      const raw = await executeTool(name, executionParams)
      return {
        call,
        name,
        params,
        output: { success: raw.success, value: raw.output, error: raw.error },
        t0,
        t1: Date.now(),
      }
    } catch (err) {
      log.error('Tool invocation failed:', { name, error: err })
      return {
        call,
        name,
        params: {},
        output: {
          success: false,
          error: err instanceof Error ? err.message : 'Tool execution failed',
        },
        t0,
        t1: Date.now(),
      }
    }
  })
  return Promise.all(pending)
}

/**
 * Decode an API error object into a flat message + metadata triple.
 */
function decodeError(err: unknown): { msg: string; kind?: string; code?: number } {
  let msg = err instanceof Error ? err.message : String(err)
  let kind: string | undefined
  let code: number | undefined
  if (err && typeof err === 'object' && 'error' in err) {
    // biome-ignore lint/suspicious/noExplicitAny: SDK error envelope
    const inner = (err as any).error
    if (inner && typeof inner === 'object') {
      msg = inner.message ?? msg
      kind = inner.type
      code = inner.code
    }
  }
  return { msg, kind, code }
}

/**
 * Append an ISO timestamp + duration to a timing segment pair.
 */
function seg(type: 'model' | 'tool', name: string, t0: number, t1: number): TimeSegment {
  return { type, name, startTime: t0, endTime: t1, duration: t1 - t0 }
}

// ── Engine class ──────────────────────────────────────────────────────────────

/**
 * Stateless engine that drives one provider request to completion.
 * Instantiate per-request; call `.run()`.
 */
export class CompatEngine {
  private readonly req: ProviderRequest
  // biome-ignore lint/suspicious/noExplicitAny: dynamic payload
  private readonly base: any
  private readonly oai: OpenAI
  private readonly seedMsgs: Message[]
  private readonly structured: boolean

  constructor(req: ProviderRequest) {
    const baseURL = deriveBaseURL(req)
    if (!req.apiKey) throw new Error('API key is required for OpenAI compatible endpoint')

    this.req = req
    this.structured = !!req.responseFormat
    this.seedMsgs = assembleConversation(req)
    this.oai = new OpenAI({ apiKey: req.apiKey, baseURL })

    const oaiTools = req.tools?.length
      ? req.tools.map((t) => ({
          type: 'function',
          function: { name: t.id, description: t.description, parameters: t.parameters },
        }))
      : undefined

    this.base = { model: req.model, messages: this.seedMsgs }
    if (req.temperature !== undefined) this.base.temperature = req.temperature
    if (req.maxTokens != null) this.base.max_completion_tokens = req.maxTokens

    if (req.responseFormat) {
      this.base.response_format = {
        type: 'json_schema',
        json_schema: {
          name: req.responseFormat.name ?? 'response_schema',
          schema: req.responseFormat.schema ?? req.responseFormat,
          strict: req.responseFormat.strict !== false,
        },
      }
      log.info('Added JSON schema response format to OpenAI-compatible request')
    }

    if (oaiTools?.length) {
      const prepared = prepareToolsWithUsageControl(oaiTools, req.tools, log, 'openai')
      const { tools: ft, toolChoice: tc } = prepared
      if (ft?.length && tc) {
        this.base.tools = ft
        this.base.tool_choice = tc
      }
    }

    log.info('Preparing OpenAI-compatible request', {
      model: req.model,
      baseURL,
      hasSystemPrompt: !!req.systemPrompt,
      hasMessages: !!req.messages?.length,
      hasTools: !!req.tools?.length,
      toolCount: req.tools?.length ?? 0,
      hasResponseFormat: this.structured,
      stream: !!req.stream,
    })
  }

  /** Entry point — returns either a static response or a streaming execution. */
  async run(): Promise<ProviderResponse | StreamingExecution> {
    const t0 = Date.now()
    const t0iso = new Date(t0).toISOString()
    const hasTools = !!this.base.tools

    try {
      if (this.req.stream && !hasTools) {
        log.info('Using streaming response for OpenAI-compatible request')
        return await this.#runDirectStream(t0, t0iso)
      }
      return await this.#runToolLoop(t0, t0iso)
    } catch (err) {
      const t1 = Date.now()
      const { msg, kind, code } = decodeError(err)
      log.error('Error in OpenAI-compatible request:', {
        error: msg,
        errorType: kind,
        errorCode: code,
        duration: t1 - t0,
      })
      throw new ProviderError(msg, {
        startTime: t0iso,
        endTime: new Date(t1).toISOString(),
        duration: t1 - t0,
      })
    }
  }

  // ── Private execution paths ─────────────────────────────────────────────────

  /**
   * Direct-stream path: no tools active, stream immediately.
   */
  async #runDirectStream(t0: number, t0iso: string): Promise<StreamingExecution> {
    const params: ChatCompletionCreateParamsStreaming = {
      ...this.base,
      stream: true,
      stream_options: { include_usage: true },
    }
    const apiStream = await this.oai.chat.completions.create(params)
    // biome-ignore lint/suspicious/noExplicitAny: self-referential result object
    const result: any = {
      execution: {
        success: true,
        output: {
          content: '',
          model: this.req.model,
          tokens: { input: 0, output: 0, total: 0 },
          toolCalls: undefined,
          providerTiming: {
            startTime: t0iso,
            endTime: new Date().toISOString(),
            duration: Date.now() - t0,
            timeSegments: [
              {
                type: 'model',
                name: 'Streaming response',
                startTime: t0,
                endTime: Date.now(),
                duration: Date.now() - t0,
              },
            ],
          },
          cost: { input: 0, output: 0, total: 0 },
        },
        logs: [],
        metadata: {
          startTime: t0iso,
          endTime: new Date().toISOString(),
          duration: Date.now() - t0,
        },
      },
    }
    result.stream = createOpenAICompatibleStream(apiStream, 'OpenAI-compatible', (text, usage) => {
      result.execution.output.content = sanitise(text, this.structured)
      result.execution.output.tokens = {
        input: usage.prompt_tokens,
        output: usage.completion_tokens,
        total: usage.total_tokens,
      }
      const c = calculateCost(this.req.model, usage.prompt_tokens, usage.completion_tokens)
      result.execution.output.cost = { input: c.input, output: c.output, total: c.total }
      const now = Date.now()
      if (result.execution.output.providerTiming) {
        result.execution.output.providerTiming.endTime = new Date(now).toISOString()
        result.execution.output.providerTiming.duration = now - t0
        const first = result.execution.output.providerTiming.timeSegments?.[0]
        if (first) {
          first.endTime = now
          first.duration = now - t0
        }
      }
    })
    return result as StreamingExecution
  }

  /**
   * Tool-loop path: non-streaming first call, then iterate over tool calls,
   * then optionally stream the final answer.
   */
  async #runToolLoop(t0: number, t0iso: string): Promise<ProviderResponse | StreamingExecution> {
    const startedAt = Date.now()
    const origChoice = this.base.tool_choice
    const forcedList: string[] = []
    let seenForced: string[] = []
    let usedForced = false

    if (this.base.tools) {
      const prep = prepareToolsWithUsageControl(this.base.tools, this.req.tools, log, 'openai')
      forcedList.push(...(prep.forcedTools ?? []))
    }

    // biome-ignore lint/suspicious/noExplicitAny: SDK response
    const syncForcedState = (resp: any, choice: unknown) => {
      if (typeof choice !== 'object') return
      const pending = resp.choices[0]?.message?.tool_calls
      if (!pending) return
      const tracked = trackForcedToolUsage(pending, choice, log, 'openai', forcedList, seenForced)
      usedForced = tracked.hasUsedForcedTool
      seenForced = tracked.usedForcedTools
    }

    let resp = await this.oai.chat.completions.create(this.base)
    const firstMs = Date.now() - startedAt

    const acc: TokenAccum = {
      input: resp.usage?.prompt_tokens ?? 0,
      output: resp.usage?.completion_tokens ?? 0,
      total: resp.usage?.total_tokens ?? 0,
    }
    let finalText = sanitise(resp.choices[0]?.message?.content ?? '', this.structured)

    const callLog: Array<Record<string, unknown>> = []
    const resultLog: unknown[] = []
    const history = [...this.seedMsgs]
    const segments: TimeSegment[] = [
      seg('model', 'Initial response', startedAt, startedAt + firstMs),
    ]
    let modelMs = firstMs
    let toolMs = 0
    let rounds = 0

    syncForcedState(resp, origChoice)

    while (rounds < MAX_TOOL_ITERATIONS) {
      const latestText = resp.choices[0]?.message?.content
      if (latestText) finalText = sanitise(latestText, this.structured)

      const pending = resp.choices[0]?.message?.tool_calls
      if (!pending?.length) break

      log.info(
        `Processing ${pending.length} tool calls (iteration ${rounds + 1}/${MAX_TOOL_ITERATIONS})`
      )

      const toolsAt = Date.now()
      const outcomes = await invokeTools(pending, this.req)
      toolMs += Date.now() - toolsAt

      history.push({
        role: 'assistant',
        content: null,
        tool_calls: pending.map(
          (c: { id: string; function: { name: string; arguments: string } }) => ({
            id: c.id,
            type: 'function',
            function: { name: c.function.name, arguments: c.function.arguments },
          })
        ),
        // biome-ignore lint/suspicious/noExplicitAny: assistant message with tool calls
      } as any)

      for (const outcome of outcomes) {
        segments.push(seg('tool', outcome.name, outcome.t0, outcome.t1))

        // biome-ignore lint/suspicious/noExplicitAny: tool result payload varies
        let payload: any
        if (outcome.output.success) {
          resultLog.push(outcome.output.value)
          payload = outcome.output.value
        } else {
          payload = {
            error: true,
            message: outcome.output.error ?? 'Tool execution failed',
            tool: outcome.name,
          }
        }

        callLog.push({
          name: outcome.name,
          arguments: outcome.params,
          startTime: new Date(outcome.t0).toISOString(),
          endTime: new Date(outcome.t1).toISOString(),
          duration: outcome.t1 - outcome.t0,
          result: payload,
          success: outcome.output.success,
        })

        history.push({
          role: 'tool',
          tool_call_id: outcome.call.id,
          content: JSON.stringify(payload),
          // biome-ignore lint/suspicious/noExplicitAny: tool result message
        } as any)
      }

      const nextReq = { ...this.base, messages: history }

      if (typeof origChoice === 'object' && usedForced && forcedList.length) {
        const remaining = forcedList.filter((n) => !seenForced.includes(n))
        if (remaining.length) {
          nextReq.tool_choice = { type: 'function', function: { name: remaining[0] } }
          log.info(`Forcing next tool: ${remaining[0]}`)
        } else {
          nextReq.tool_choice = 'auto'
          log.info('All forced tools have been used, switching to auto tool_choice')
        }
      }

      const mAt = Date.now()
      resp = await this.oai.chat.completions.create(nextReq)
      syncForcedState(resp, nextReq.tool_choice)
      const mEnd = Date.now()
      const mDelta = mEnd - mAt

      segments.push(seg('model', `Model response (iteration ${rounds + 1})`, mAt, mEnd))
      modelMs += mDelta

      const newText = resp.choices[0]?.message?.content
      if (newText) finalText = sanitise(newText, this.structured)
      if (resp.usage) accumUsage(acc, resp.usage)

      rounds++
    }

    if (this.req.stream) {
      log.info('Using streaming for final response after tool processing')
      return this.#postToolStream(
        history,
        acc,
        callLog,
        t0,
        t0iso,
        modelMs,
        toolMs,
        firstMs,
        rounds,
        segments
      )
    }

    const done = Date.now()
    return {
      content: finalText,
      model: this.req.model,
      tokens: acc,
      toolCalls: callLog.length ? (callLog as unknown as FunctionCallResponse[]) : undefined,
      toolResults: resultLog.length ? resultLog : undefined,
      timing: {
        startTime: t0iso,
        endTime: new Date(done).toISOString(),
        duration: done - t0,
        modelTime: modelMs,
        toolsTime: toolMs,
        firstResponseTime: firstMs,
        iterations: rounds + 1,
        timeSegments: segments,
      },
    }
  }

  /**
   * Stream the final answer after tool calls have been resolved.
   */
  async #postToolStream(
    history: Message[],
    acc: TokenAccum,
    callLog: Array<Record<string, unknown>>,
    t0: number,
    t0iso: string,
    modelMs: number,
    toolMs: number,
    firstMs: number,
    rounds: number,
    segments: TimeSegment[]
  ): Promise<StreamingExecution> {
    const prior = calculateCost(this.req.model, acc.input, acc.output)

    const params: ChatCompletionCreateParamsStreaming = {
      ...this.base,
      messages: history,
      tool_choice: 'auto',
      stream: true,
      stream_options: { include_usage: true },
    }
    const apiStream = await this.oai.chat.completions.create(params)

    // biome-ignore lint/suspicious/noExplicitAny: self-referential result
    const result: any = {
      execution: {
        success: true,
        output: {
          content: '',
          model: this.req.model,
          tokens: { ...acc },
          toolCalls: callLog.length ? { list: callLog, count: callLog.length } : undefined,
          providerTiming: {
            startTime: t0iso,
            endTime: new Date().toISOString(),
            duration: Date.now() - t0,
            modelTime: modelMs,
            toolsTime: toolMs,
            firstResponseTime: firstMs,
            iterations: rounds + 1,
            timeSegments: segments,
          },
          cost: { input: prior.input, output: prior.output, total: prior.total },
        },
        logs: [],
        metadata: {
          startTime: t0iso,
          endTime: new Date().toISOString(),
          duration: Date.now() - t0,
        },
      },
    }

    result.stream = createOpenAICompatibleStream(apiStream, 'OpenAI-compatible', (text, usage) => {
      result.execution.output.content = sanitise(text, this.structured)
      result.execution.output.tokens = {
        input: acc.input + usage.prompt_tokens,
        output: acc.output + usage.completion_tokens,
        total: acc.total + usage.total_tokens,
      }
      const delta = calculateCost(this.req.model, usage.prompt_tokens, usage.completion_tokens)
      result.execution.output.cost = {
        input: prior.input + delta.input,
        output: prior.output + delta.output,
        total: prior.total + delta.total,
      }
    })

    return result as StreamingExecution
  }
}

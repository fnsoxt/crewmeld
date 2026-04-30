/**
 * OpenAI-compatible mock LLM shim for Playwright E2E tests.
 *
 * Usage in a spec:
 *   import { mockLlm } from '../fixtures/mock-llm'
 *   // ...
 *   await mockLlm(page, { chatResponse: '你好，我是测试回复' })
 *
 * Intercepts all outbound requests to the 8 China LLM provider endpoints
 * plus OpenAI, and responds with deterministic payloads. Supports both
 * streaming (SSE) and non-streaming (JSON) modes.
 *
 * Set env var `LLM_PROVIDER_KEYS_OK=1` to bypass interception entirely
 * (live-mode testing against real provider APIs).
 *
 * ## Single-handler limitation
 *
 * `mockLlm` installs a **single** `page.route()` handler for the life of the
 * `Page`. All matched requests receive the same payload. For tests that need
 * different responses on sequential calls (e.g. first call streams successfully,
 * second call returns a non-stream error), call `page.unroute(/…/)` between
 * calls and re-invoke `mockLlm` with the new options.
 *
 * @module mock-llm
 */
import type { Page, Route } from '@playwright/test'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Options controlling mock LLM behaviour. */
export interface MockLlmOptions {
  /**
   * The assistant message text returned in non-stream mode.
   * Defaults to a generic placeholder string.
   */
  chatResponse?: string

  /**
   * Ordered chunks emitted in stream mode (SSE `data:` lines).
   * If omitted, a single-chunk stream is synthesised from `chatResponse`.
   */
  streamChunks?: string[]

  /**
   * When `true`, every matched request responds with **HTTP 500** and a JSON
   * error body — it does **not** abort the network connection. Use this to
   * test the app's handling of HTTP error bodies (e.g. displaying an error
   * message to the user). For testing network-failure paths (connection
   * refused, timeout, DNS failure), use `page.route()` directly with
   * `route.abort()` instead of this option.
   */
  failOnCall?: boolean

  /**
   * Subset of providers to intercept. Omit (or pass empty array) to intercept
   * all nine providers.
   */
  providers?: Array<
    | 'deepseek'
    | 'qwen'
    | 'ernie'
    | 'hunyuan'
    | 'moonshot'
    | 'zhipu'
    | 'doubao'
    | 'minimax'
    | 'openai'
  >
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** Maps each logical provider name to its canonical API hostname(s). */
const PROVIDER_HOSTS: Record<string, string[]> = {
  deepseek: ['api.deepseek.com'],
  qwen: ['dashscope.aliyuncs.com'],
  ernie: ['qianfan.baidubce.com'],
  hunyuan: ['api.hunyuan.cloud.tencent.com'],
  moonshot: ['api.moonshot.cn'],
  zhipu: ['open.bigmodel.cn'],
  doubao: ['ark.cn-beijing.volces.com'],
  minimax: ['api.minimax.chat'],
  openai: ['api.openai.com'],
}

const DEFAULT_RESPONSE = '[mock] 这是一条测试回复。'

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

/**
 * Builds a non-streaming OpenAI-compatible chat completion JSON body.
 */
function buildJsonResponse(content: string): string {
  return JSON.stringify({
    id: 'mock-chatcmpl-00000000',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'mock-model',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  })
}

/**
 * Builds a streaming SSE body from an ordered list of text chunks.
 * Each chunk is wrapped in an OpenAI-compatible `data:` event. The sequence
 * is terminated by `data: [DONE]\n\n`.
 */
function buildSseResponse(chunks: string[]): string {
  const events = chunks.map(
    (text) =>
      'data: ' +
      JSON.stringify({
        id: 'mock-chatcmpl-00000000',
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: 'mock-model',
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: text },
            finish_reason: null,
          },
        ],
      }) +
      '\n\n'
  )
  events.push('data: [DONE]\n\n')
  return events.join('')
}

/**
 * Detects whether a route request is asking for a streaming response.
 *
 * Primary detection: `stream: true` in the JSON request body.
 * Fallback: `stream=true` in the URL query string (some providers).
 */
function isStreamRequest(route: Route): boolean {
  const url = route.request().url()

  // Primary: check the POST body
  try {
    const body = route.request().postDataJSON() as Record<string, unknown> | null
    if (body !== null && body.stream === true) {
      return true
    }
  } catch {
    // postDataJSON throws if the body is not valid JSON — treat as non-stream.
  }

  // Fallback: URL query param
  return url.includes('stream=true')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Installs Playwright route intercepts for LLM provider hostnames so that
 * E2E specs do not require live API keys.
 *
 * Call this once per test (or in a `beforeEach` block) before the action that
 * triggers LLM requests.
 *
 * When the env var `LLM_PROVIDER_KEYS_OK=1` is set, this function is a no-op
 * so live-mode runs hit real provider APIs.
 *
 * @param page    - Playwright `Page` instance.
 * @param opts    - Optional configuration; see {@link MockLlmOptions}.
 */
export async function mockLlm(page: Page, opts: MockLlmOptions = {}): Promise<void> {
  // Live-mode bypass — skip interception entirely.
  if (process.env.LLM_PROVIDER_KEYS_OK === '1') {
    return
  }

  const chatResponse = opts.chatResponse ?? DEFAULT_RESPONSE
  const streamChunks = opts.streamChunks ?? [chatResponse]

  // Resolve the set of hostnames to intercept.
  const providerKeys =
    opts.providers && opts.providers.length > 0
      ? opts.providers
      : (Object.keys(PROVIDER_HOSTS) as Array<keyof typeof PROVIDER_HOSTS>)

  const hostnameSet = new Set<string>()
  for (const key of providerKeys) {
    const hosts = PROVIDER_HOSTS[key as string]
    if (hosts) {
      for (const h of hosts) {
        hostnameSet.add(h)
      }
    }
  }

  // Register a single broad route handler that matches any HTTPS URL whose
  // hostname is in the set. Playwright glob patterns don't support alternation,
  // so we use a RegExp instead.
  const hostnamePattern = [...hostnameSet].map((h) => h.replace(/\./g, '\\.')).join('|')

  const routeRegexp = new RegExp(`https?://(${hostnamePattern})/`)

  await page.route(routeRegexp, (route) => {
    // Error injection path.
    if (opts.failOnCall) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: '[mock] Injected failure', type: 'mock_error' } }),
      })
    }

    if (isStreamRequest(route)) {
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream; charset=utf-8',
        body: buildSseResponse(streamChunks),
      })
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: buildJsonResponse(chatResponse),
    })
  })
}

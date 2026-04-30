/**
 * MSW request handlers for server-side BFF E2E test interception.
 *
 * These handlers run inside the Next.js Node.js process (via
 * `apps/crewmeld/instrumentation.ts`) when `E2E_MOCK_SERVER=1`. They
 * intercept outbound HTTP that the BFF makes to LLM providers and RAGFlow,
 * which `page.route()` cannot intercept because those requests originate
 * from the server process, not the browser.
 *
 * Payload shapes mirror the browser-side mocks in:
 *   - `tests/e2e/fixtures/mock-llm.ts`
 *   - `tests/e2e/fixtures/mock-ragflow.ts`
 *
 * @module tests/e2e/fixtures/server-mocks/handlers
 */
import { HttpResponse, http } from 'msw'

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const DEFAULT_RESPONSE = '[mock] 这是一条测试回复。'

/** Maps each logical provider name to its canonical API hostname. */
const PROVIDER_HOSTS: Record<string, string> = {
  deepseek: 'api.deepseek.com',
  qwen: 'dashscope.aliyuncs.com',
  ernie: 'qianfan.baidubce.com',
  hunyuan: 'api.hunyuan.cloud.tencent.com',
  moonshot: 'api.moonshot.cn',
  zhipu: 'open.bigmodel.cn',
  doubao: 'ark.cn-beijing.volces.com',
  minimax: 'api.minimax.chat',
  openai: 'api.openai.com',
}

/**
 * Reverse map: hostname → provider ID.
 * Used by handlers to include the provider ID in the mock response so that
 * specs asserting `"来自{providerId}的回复"` can match the server-side mock.
 */
const HOST_TO_PROVIDER_ID: Record<string, string> = Object.fromEntries(
  Object.entries(PROVIDER_HOSTS).map(([id, host]) => [host, id])
)

/** Default RAGFlow base URL used in mock-ragflow.ts. */
const DEFAULT_RAGFLOW_URL = 'http://mock-ragflow.local'

// ---------------------------------------------------------------------------
// LLM response builders
// ---------------------------------------------------------------------------

/**
 * Builds a non-streaming OpenAI-compatible chat completion JSON body.
 *
 * @param content - The assistant message text.
 */
function buildJsonResponse(content: string): Record<string, unknown> {
  return {
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
  }
}

/**
 * Builds a streaming SSE body string from an ordered list of text chunks.
 * Each chunk is wrapped in an OpenAI-compatible `data:` event, terminated
 * by `data: [DONE]`.
 *
 * @param chunks - Ordered array of text fragments.
 */
function buildSseBody(chunks: string[]): string {
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
 * Detects whether an incoming request is asking for a streaming response.
 * Checks for `stream: true` in the JSON body, then `stream=true` in the URL.
 *
 * @param req - The MSW Request object.
 * @param bodyJson - Pre-parsed request body (may be null).
 */
function isStreamRequest(req: Request, bodyJson: Record<string, unknown> | null): boolean {
  if (bodyJson !== null && bodyJson.stream === true) {
    return true
  }
  return new URL(req.url).searchParams.get('stream') === 'true'
}

// ---------------------------------------------------------------------------
// Generic LLM handler factory
// ---------------------------------------------------------------------------

/**
 * Creates an MSW POST handler for a given provider hostname.
 * Intercepts all paths under that hostname (e.g. `/v1/chat/completions`).
 *
 * @param hostname - The provider API hostname.
 */
function makeLlmHandler(hostname: string) {
  return http.post(`https://${hostname}/*`, async ({ request }) => {
    let bodyJson: Record<string, unknown> | null = null
    try {
      bodyJson = (await request.json()) as Record<string, unknown>
    } catch {
      // Body may not be JSON — treat as non-stream.
    }

    // Compose a response that satisfies multiple spec assertions simultaneously:
    //   - china-llm-providers.spec.ts: expects `"来自{providerId}的回复"`
    //   - i18n-detection.spec.ts:       expects content containing "Hello"
    // Both specs use `.toContain()` so embedding both strings satisfies both.
    const providerId = HOST_TO_PROVIDER_ID[hostname] ?? 'unknown'
    const content = `来自${providerId}的回复 Hello, I am a test bot.`
    const chunks = [content]

    if (isStreamRequest(request, bodyJson)) {
      return new HttpResponse(buildSseBody(chunks), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      })
    }

    return HttpResponse.json(buildJsonResponse(content), { status: 200 })
  })
}

// ---------------------------------------------------------------------------
// RAGFlow constants (mirrored from mock-ragflow.ts)
// ---------------------------------------------------------------------------

const MOCK_DATASET_ID = 'mock-dataset-00000000'
const MOCK_DOCUMENT_ID = 'mock-document-00000000'
const MOCK_CHUNK_ID = 'mock-chunk-00000000'

const MOCK_DATASET = {
  id: MOCK_DATASET_ID,
  name: '[mock] knowledge base',
  description: 'Mock dataset created by Playwright test fixture',
  language: 'Chinese+English',
  embedding_model: 'mock-embedding',
  permission: 'me',
  document_count: 1,
  chunk_count: 3,
  parse_method: 'naive',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const MOCK_CHUNK_ITEM = {
  id: MOCK_CHUNK_ID,
  content: '[mock] This is a test chunk from the Playwright RAGFlow fixture.',
  document_id: MOCK_DOCUMENT_ID,
  document_name: '[mock] document.pdf',
  dataset_id: MOCK_DATASET_ID,
  available_int: 1,
  positions: [],
}

function buildMockDocument(parseProgress: number) {
  const run = parseProgress >= 1 ? '3' : '1'
  return {
    id: MOCK_DOCUMENT_ID,
    name: '[mock] document.pdf',
    size: 1024,
    type: 'pdf',
    status: '1',
    run,
    progress: parseProgress,
    progress_msg: run === '3' ? 'Done' : `Parsing… ${Math.round(parseProgress * 100)}%`,
    chunk_count: run === '3' ? 3 : 0,
    chunk_num: run === '3' ? 3 : 0,
    token_count: run === '3' ? 300 : 0,
    token_num: run === '3' ? 300 : 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

/** Wraps data in the standard RAGFlow envelope `{ code: 0, message: '', data }`. */
function ragflowOk<T>(data: T): Record<string, unknown> {
  return { code: 0, message: '', data }
}

// ---------------------------------------------------------------------------
// RAGFlow handler
// ---------------------------------------------------------------------------

/**
 * Single catch-all MSW handler for all RAGFlow API paths under `/api/v1/`.
 * Dispatches internally by method and pathname, mirroring the logic in
 * `mock-ragflow.ts`.
 */
const ragflowHandler = http.all(`${DEFAULT_RAGFLOW_URL}/api/v1/*`, async ({ request }) => {
  const method = request.method.toUpperCase()
  const url = new URL(request.url)
  const pathname = url.pathname
  const parseProgress = 1 // default: fully parsed

  // --- POST /api/v1/retrieval ---
  if (pathname === '/api/v1/retrieval' && method === 'POST') {
    const defaultHits = [
      { id: MOCK_CHUNK_ID, text: '[mock] Retrieval result from Playwright fixture.', score: 0.95 },
    ]
    const chunks = defaultHits.map((hit) => ({
      id: hit.id,
      content: hit.text,
      document_id: MOCK_DOCUMENT_ID,
      document_name: '[mock] document.pdf',
      dataset_id: MOCK_DATASET_ID,
      similarity: hit.score,
      vector_similarity: hit.score,
      term_similarity: hit.score * 0.9,
      positions: [],
    }))
    return HttpResponse.json(
      ragflowOk({
        chunks,
        doc_aggs: [
          { doc_id: MOCK_DOCUMENT_ID, doc_name: '[mock] document.pdf', count: chunks.length },
        ],
        total: chunks.length,
      }),
      { status: 200 }
    )
  }

  // --- /api/v1/datasets (no trailing segment) ---
  if (pathname === '/api/v1/datasets') {
    if (method === 'GET') {
      const idParam = url.searchParams.get('id')
      if (idParam !== null) {
        return HttpResponse.json(ragflowOk([{ ...MOCK_DATASET, id: idParam }]), { status: 200 })
      }
      return HttpResponse.json(ragflowOk([MOCK_DATASET]), { status: 200 })
    }
    if (method === 'POST') {
      return HttpResponse.json(ragflowOk(MOCK_DATASET), { status: 200 })
    }
    if (method === 'DELETE') {
      return HttpResponse.json(ragflowOk({}), { status: 200 })
    }
  }

  // --- /api/v1/datasets/{id}/documents ---
  const docListMatch = pathname.match(/^\/api\/v1\/datasets\/([^/]+)\/documents$/)
  if (docListMatch) {
    const datasetId = decodeURIComponent(docListMatch[1])
    const mockDoc = buildMockDocument(parseProgress)

    if (method === 'GET') {
      const idParam = url.searchParams.get('id')
      if (idParam !== null) {
        return HttpResponse.json(ragflowOk({ docs: [{ ...mockDoc, id: idParam }], total: 1 }), {
          status: 200,
        })
      }
      return HttpResponse.json(
        ragflowOk({ docs: [{ ...mockDoc, dataset_id: datasetId }], total: 1 }),
        { status: 200 }
      )
    }
    if (method === 'POST') {
      return HttpResponse.json(ragflowOk([{ ...mockDoc, dataset_id: datasetId }]), { status: 200 })
    }
    if (method === 'DELETE' || method === 'PUT') {
      return HttpResponse.json(ragflowOk({}), { status: 200 })
    }
  }

  // --- /api/v1/datasets/{id}/documents/{docId} ---
  const docItemMatch = pathname.match(/^\/api\/v1\/datasets\/([^/]+)\/documents\/([^/]+)$/)
  if (docItemMatch) {
    const documentId = decodeURIComponent(docItemMatch[2])
    const mockDoc = buildMockDocument(parseProgress)

    if (method === 'GET') {
      return new HttpResponse('[mock binary content]', {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      })
    }
    if (method === 'PUT') {
      return HttpResponse.json(ragflowOk({ ...mockDoc, id: documentId }), { status: 200 })
    }
  }

  // --- /api/v1/datasets/{id}/documents/{docId}/chunks ---
  const docChunksMatch = pathname.match(
    /^\/api\/v1\/datasets\/([^/]+)\/documents\/([^/]+)\/chunks$/
  )
  if (docChunksMatch) {
    const documentId = decodeURIComponent(docChunksMatch[2])
    if (method === 'GET') {
      const mockDoc = buildMockDocument(parseProgress)
      return HttpResponse.json(
        ragflowOk({
          chunks: [{ ...MOCK_CHUNK_ITEM, document_id: documentId }],
          doc: { ...mockDoc, id: documentId },
          total: 1,
        }),
        { status: 200 }
      )
    }
  }

  // --- /api/v1/datasets/{id}/chunks ---
  const datasetChunksMatch = pathname.match(/^\/api\/v1\/datasets\/([^/]+)\/chunks$/)
  if (datasetChunksMatch) {
    if (method === 'GET') {
      return HttpResponse.json(
        ragflowOk({ chunks: [MOCK_CHUNK_ITEM], doc: buildMockDocument(parseProgress), total: 1 }),
        { status: 200 }
      )
    }
    // POST (parse), DELETE (stop/deleteChunks)
    return HttpResponse.json(ragflowOk({}), { status: 200 })
  }

  // --- /api/v1/datasets/{id}/chunks/{chunkId} ---
  const chunkItemMatch = pathname.match(/^\/api\/v1\/datasets\/([^/]+)\/chunks\/([^/]+)$/)
  if (chunkItemMatch) {
    if (method === 'PUT') {
      return HttpResponse.json(ragflowOk({}), { status: 200 })
    }
  }

  // Fallback: unmatched path — return structured 404 so the app sees a clear error.
  return HttpResponse.json(
    { code: 404, message: `[mock-ragflow] Unmatched path: ${method} ${pathname}`, data: {} },
    { status: 404 }
  )
})

// ---------------------------------------------------------------------------
// Handler exports
// ---------------------------------------------------------------------------

/** MSW handlers for all 9 LLM provider hostnames (8 China + OpenAI). */
export const llmHandlers = Object.values(PROVIDER_HOSTS).map(makeLlmHandler)

/** MSW handlers for the RAGFlow API (all methods, all sub-paths). */
export const ragflowHandlers = [ragflowHandler]

/** Combined handler list — passed to `setupServer(…handlers)`. */
export const handlers = [...llmHandlers, ...ragflowHandlers]

/**
 * RAGFlow API mock for Playwright E2E tests.
 *
 * Intercepts outbound HTTP requests that the app's RAGFlow client
 * (`apps/crewmeld/lib/ragflow/client.ts`) sends to the configured RAGFlow
 * endpoint. Provides deterministic responses for the dataset, document,
 * chunk, and retrieval endpoints so that E2E specs run without a live
 * RAGFlow instance.
 *
 * Usage in a spec:
 *   import { mockRagflow } from '../fixtures/mock-ragflow'
 *   // ...
 *   await mockRagflow(page, { parseProgress: 1 })
 *
 * Set the env var `RAGFLOW_URL` to bypass interception entirely and let
 * requests reach a real RAGFlow instance (live-mode testing).
 *
 * ## Endpoint coverage
 *
 * All paths under `{ragflowUrl}/api/v1/` that are called by the app:
 *   - GET/POST/DELETE  /api/v1/datasets
 *   - GET              /api/v1/datasets?id={id}   (getDataset)
 *   - GET              /api/v1/datasets/{id}/documents
 *   - POST/DELETE      /api/v1/datasets/{id}/documents
 *   - GET              /api/v1/datasets/{id}/documents?id={docId}  (getDocument)
 *   - PUT              /api/v1/datasets/{id}/documents/{docId}
 *   - GET              /api/v1/datasets/{id}/documents/{docId}     (download, passthrough)
 *   - POST/DELETE      /api/v1/datasets/{id}/chunks                (parse / stop / deleteChunks)
 *   - GET              /api/v1/datasets/{id}/chunks                (getDocumentChunks via docId query)
 *   - PUT              /api/v1/datasets/{id}/chunks/{chunkId}
 *   - GET              /api/v1/datasets/{id}/documents/{docId}/chunks
 *   - POST             /api/v1/retrieval
 *
 * ## Single-handler limitation
 *
 * `mockRagflow` registers a **single broad** `page.route()` RegExp handler
 * that catches every request whose URL begins with `{ragflowUrl}/api/v1/`.
 * Within the handler, paths are matched with `URL` parsing, so request
 * order does not matter. All matched requests receive the same payload
 * shapes controlled by `MockRagflowOptions`. For tests that need different
 * responses on sequential calls (e.g. first parse returns progress 0, second
 * returns progress 1), call `page.unroute(regexp)` between calls and
 * re-invoke `mockRagflow` with updated options. Alternatively unroute the
 * specific RegExp used in the first call; you can capture it from the
 * module-level `ROUTE_REGEXP` export.
 *
 * @module mock-ragflow
 */
import type { Page, Route } from '@playwright/test'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Options controlling mock RAGFlow behaviour. */
export interface MockRagflowOptions {
  /**
   * Override the RAGFlow base URL to intercept.
   * Defaults to `http://mock-ragflow.local` (a non-routable placeholder that
   * can only be reached via Playwright route interception).
   */
  ragflowUrl?: string

  /**
   * Simulated document parse progress (0–1).
   * Reflected in the `progress` field of `RagflowDocumentInfo` responses.
   * `run` is set to `'1'` (RUNNING) when < 1, `'3'` (DONE) when 1.
   * Defaults to `1` (fully parsed).
   */
  parseProgress?: number

  /**
   * Hits returned by the `/api/v1/retrieval` endpoint.
   * Each entry maps to a `RagflowChunk`-shaped object.
   * Defaults to a single placeholder chunk.
   */
  retrievalHits?: Array<{ id: string; text: string; score: number }>

  /**
   * When `true`, every matched request responds with HTTP 500 and a
   * RAGFlow-shaped error body (`{ code: 1, message: '…', data: {} }`).
   * Use this to test the app's error-handling paths.
   */
  failOnCall?: boolean
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** Default placeholder base URL — never resolves in production. */
const DEFAULT_RAGFLOW_URL = 'http://mock-ragflow.local'

/** Stub dataset returned for list / create / get operations. */
const MOCK_DATASET_ID = 'mock-dataset-00000000'

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

/** Stub document info — progress/run are overridden per request. */
const MOCK_DOCUMENT_ID = 'mock-document-00000000'

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

const MOCK_CHUNK_ID = 'mock-chunk-00000000'

const MOCK_CHUNK_ITEM = {
  id: MOCK_CHUNK_ID,
  content: '[mock] This is a test chunk from the Playwright RAGFlow fixture.',
  document_id: MOCK_DOCUMENT_ID,
  document_name: '[mock] document.pdf',
  dataset_id: MOCK_DATASET_ID,
  available_int: 1,
  positions: [],
}

const DEFAULT_RETRIEVAL_HITS: Array<{ id: string; text: string; score: number }> = [
  { id: MOCK_CHUNK_ID, text: '[mock] Retrieval result from Playwright fixture.', score: 0.95 },
]

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

/**
 * Wraps `data` in the standard RAGFlow envelope: `{ code: 0, message: '', data }`.
 */
function ragflowOk<T>(data: T): string {
  return JSON.stringify({ code: 0, message: '', data })
}

/**
 * Builds a RAGFlow error envelope: `{ code: 1, message, data: {} }`.
 */
function ragflowErr(message = '[mock] Injected failure'): string {
  return JSON.stringify({ code: 1, message, data: {} })
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * Processes a matched RAGFlow API route and responds with an appropriate mock.
 */
function handleRagflowRoute(
  route: Route,
  opts: Required<Pick<MockRagflowOptions, 'parseProgress' | 'retrievalHits' | 'failOnCall'>>
): Promise<void> {
  if (opts.failOnCall) {
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: ragflowErr(),
    })
  }

  const req = route.request()
  const method = req.method().toUpperCase()
  const url = new URL(req.url())
  // Strip query string for path matching
  const pathname = url.pathname

  // --- POST /api/v1/retrieval ---
  if (pathname === '/api/v1/retrieval' && method === 'POST') {
    const chunks = opts.retrievalHits.map((hit) => ({
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
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: ragflowOk<{ chunks: typeof chunks; doc_aggs: unknown[]; total: number }>({
        chunks,
        doc_aggs: [
          { doc_id: MOCK_DOCUMENT_ID, doc_name: '[mock] document.pdf', count: chunks.length },
        ],
        total: chunks.length,
      }),
    })
  }

  // --- /api/v1/datasets --- (no path segment after)
  if (pathname === '/api/v1/datasets') {
    if (method === 'GET') {
      // getDataset uses ?id=, listDatasets uses ?page=&page_size=
      const idParam = url.searchParams.get('id')
      if (idParam !== null) {
        // getDataset — return array with one item (app picks index 0)
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: ragflowOk([{ ...MOCK_DATASET, id: idParam }]),
        })
      }
      // listDatasets
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: ragflowOk([MOCK_DATASET]),
      })
    }
    if (method === 'POST') {
      // createDataset
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: ragflowOk(MOCK_DATASET),
      })
    }
    if (method === 'DELETE') {
      // deleteDataset
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: ragflowOk({}),
      })
    }
  }

  // --- /api/v1/datasets/{id}/documents ---
  const docListMatch = pathname.match(/^\/api\/v1\/datasets\/([^/]+)\/documents$/)
  if (docListMatch) {
    const datasetId = decodeURIComponent(docListMatch[1])
    const mockDoc = buildMockDocument(opts.parseProgress)

    if (method === 'GET') {
      const idParam = url.searchParams.get('id')
      if (idParam !== null) {
        // getDocument — returns { docs: [...], total: 1 }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: ragflowOk({ docs: [{ ...mockDoc, id: idParam }], total: 1 }),
        })
      }
      // listDocuments — returns { docs: [...], total: N }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: ragflowOk({ docs: [{ ...mockDoc, dataset_id: datasetId }], total: 1 }),
      })
    }
    if (method === 'POST') {
      // uploadDocument — returns array of RagflowDocumentInfo
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: ragflowOk([{ ...mockDoc, dataset_id: datasetId }]),
      })
    }
    if (method === 'DELETE') {
      // deleteDocument (body: { ids: [documentId] })
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: ragflowOk({}),
      })
    }
    if (method === 'PUT') {
      // updateDocumentEnabled — handled by the more specific /{docId} pattern below,
      // but guard here just in case
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: ragflowOk({}),
      })
    }
  }

  // --- /api/v1/datasets/{id}/documents/{docId} ---
  const docItemMatch = pathname.match(/^\/api\/v1\/datasets\/([^/]+)\/documents\/([^/]+)$/)
  if (docItemMatch) {
    const documentId = decodeURIComponent(docItemMatch[2])
    const mockDoc = buildMockDocument(opts.parseProgress)

    if (method === 'GET') {
      // downloadDocument — return raw bytes stub (plain text)
      return route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        body: '[mock binary content]',
      })
    }
    if (method === 'PUT') {
      // renameDocument / updateDocumentEnabled
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: ragflowOk({ ...mockDoc, id: documentId }),
      })
    }
  }

  // --- /api/v1/datasets/{id}/documents/{docId}/chunks ---
  const docChunksMatch = pathname.match(
    /^\/api\/v1\/datasets\/([^/]+)\/documents\/([^/]+)\/chunks$/
  )
  if (docChunksMatch) {
    const documentId = decodeURIComponent(docChunksMatch[2])
    if (method === 'GET') {
      // getDocumentChunks
      const mockDoc = buildMockDocument(opts.parseProgress)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: ragflowOk({
          chunks: [{ ...MOCK_CHUNK_ITEM, document_id: documentId }],
          doc: { ...mockDoc, id: documentId },
          total: 1,
        }),
      })
    }
  }

  // --- /api/v1/datasets/{id}/chunks ---
  const datasetChunksMatch = pathname.match(/^\/api\/v1\/datasets\/([^/]+)\/chunks$/)
  if (datasetChunksMatch) {
    if (method === 'POST') {
      // parseDocuments — trigger chunking
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: ragflowOk({}),
      })
    }
    if (method === 'DELETE') {
      // stopDocumentsParsing or deleteChunks (both use DELETE on same path)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: ragflowOk({}),
      })
    }
    if (method === 'GET') {
      // getDocumentChunks (legacy path — some client versions use this)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: ragflowOk({
          chunks: [MOCK_CHUNK_ITEM],
          doc: buildMockDocument(opts.parseProgress),
          total: 1,
        }),
      })
    }
  }

  // --- /api/v1/datasets/{id}/chunks/{chunkId} ---
  const chunkItemMatch = pathname.match(/^\/api\/v1\/datasets\/([^/]+)\/chunks\/([^/]+)$/)
  if (chunkItemMatch) {
    if (method === 'PUT') {
      // updateChunk
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: ragflowOk({}),
      })
    }
  }

  // Fallback — unexpected path; return 404-shaped RAGFlow response so the app
  // sees a clear error rather than a network-level connection failure.
  return route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({
      code: 404,
      message: `[mock-ragflow] Unmatched path: ${method} ${pathname}`,
      data: {},
    }),
  })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Installs Playwright route intercepts for all RAGFlow API paths used by the
 * `lib/ragflow/client.ts` module.
 *
 * Call this once per test (or in a `beforeEach` block) before any action that
 * triggers RAGFlow requests.
 *
 * When the env var `RAGFLOW_URL` is set, this function is a **no-op** so that
 * live-mode runs hit the real RAGFlow instance.
 *
 * @param page - Playwright `Page` instance.
 * @param opts - Optional configuration; see {@link MockRagflowOptions}.
 */
export async function mockRagflow(page: Page, opts: MockRagflowOptions = {}): Promise<void> {
  // Live-mode bypass — do not intercept if a real RAGFlow URL is configured.
  if (process.env.RAGFLOW_URL) {
    return
  }

  const baseUrl = (opts.ragflowUrl ?? DEFAULT_RAGFLOW_URL).replace(/\/+$/, '')
  const parseProgress = opts.parseProgress ?? 1
  const retrievalHits = opts.retrievalHits ?? DEFAULT_RETRIEVAL_HITS
  const failOnCall = opts.failOnCall ?? false

  // Escape the base URL for use in a RegExp and match everything under /api/v1/.
  const escapedBase = baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const routeRegexp = new RegExp(`${escapedBase}/api/v1/`)

  await page.route(routeRegexp, (route) =>
    handleRagflowRoute(route, { parseProgress, retrievalHits, failOnCall })
  )
}

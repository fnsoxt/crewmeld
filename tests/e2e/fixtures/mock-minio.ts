/**
 * MinIO / S3-compatible storage mock shim for Playwright E2E tests.
 *
 * ## Architecture note — when this shim is actually invoked
 *
 * The app has two distinct S3 code paths:
 *
 * 1. **Server-side BFF** (`lib/conversation/file-storage.ts`,
 *    `lib/uploads/providers/s3/client.ts`, the MinIO proxy route):
 *    All S3 SDK calls originate from the Next.js server process, not the
 *    browser. Playwright's `page.route()` only intercepts browser-originated
 *    (renderer-process) network requests, so these server-side calls are
 *    **never** caught here. They must be handled by ensuring the app falls back
 *    to local storage (unset `S3_BUCKET_NAME` + `AWS_REGION`) or by running a
 *    real MinIO container in CI.
 *
 * 2. **Browser-direct presigned PUT** (`hooks/knowledge/use-knowledge-upload.ts`):
 *    For knowledge-base file uploads the browser calls `/api/files/presigned`
 *    to obtain a presigned S3 PUT URL, then PUTs the file bytes **directly to
 *    the MinIO endpoint** from the browser. This is the one path where
 *    `page.route()` can intercept the actual S3 traffic.
 *    Typical URL pattern: `{MINIO_ENDPOINT}/{bucket}/{key}?X-Amz-*`
 *
 * ## Buckets discovered in the codebase
 *
 * | Env var                         | Default                  | Context             |
 * |----------------------------------|--------------------------|---------------------|
 * | `MINIO_BUCKET`                  | `tool-files`             | conversation files  |
 * | `S3_BUCKET_NAME`                | (no default — S3 off)    | general uploads     |
 * | `S3_KB_BUCKET_NAME`             | (no default — S3 off)    | knowledge base      |
 * | `S3_EXECUTION_FILES_BUCKET_NAME`| `crewmeld-execution-files`| execution files    |
 * | `S3_CHAT_BUCKET_NAME`           | (no default)             | chat attachments    |
 * | `S3_COPILOT_BUCKET_NAME`        | (no default)             | copilot uploads     |
 * | `S3_PROFILE_PICTURES_BUCKET_NAME`| (no default)            | profile pictures    |
 * | `S3_OG_IMAGES_BUCKET_NAME`      | (no default)             | OG images          |
 *
 * ## Operations covered
 *
 * - PUT    → 200 with ETag header (presigned single-part upload)
 * - GET    → 200 with a minimal binary body  (presigned download)
 * - DELETE → 204 no body
 * - HEAD   → 200 with ETag + content-type headers
 *
 * ## Bypass
 *
 * When the env var `MINIO_ENDPOINT` is set this function is a **no-op** so
 * live-mode CI runs hit the real MinIO container.
 *
 * ## Single-handler limitation
 *
 * `mockMinio` registers a single broad `page.route()` handler. All matched
 * requests receive the same response shape. For tests that need to inject
 * failures on specific calls, pass `failOnCall: true` or call
 * `page.unroute(regexp)` and re-invoke with updated options.
 *
 * Usage in a spec:
 *   import { mockMinio } from '../fixtures/mock-minio'
 *   // ...
 *   await mockMinio(page)
 *
 * @module mock-minio
 */
import type { Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Options controlling mock MinIO / S3 behaviour. */
export interface MockMinioOptions {
  /**
   * Override the MinIO base URL pattern to intercept.
   * Defaults to `http://mock-minio.local` — a non-routable placeholder that
   * can only be reached via Playwright route interception.
   * In practice, set this to the value of `MINIO_ENDPOINT` or `S3_ENDPOINT`
   * that the presigned URL generator will embed in the signed URLs.
   */
  endpoint?: string

  /**
   * Bucket name to scope the route pattern.
   * When omitted the pattern matches **any** path under the endpoint, so it
   * covers all buckets regardless of their configured names.
   */
  bucket?: string

  /**
   * When `true`, every matched request responds with HTTP 500 and a plain-text
   * error body. Use this to test the app's handling of S3 write/read failures.
   */
  failOnCall?: boolean
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/**
 * Default placeholder endpoint — never resolves in production.
 * Override via `opts.endpoint` when the presigned URL generator uses a
 * different base URL (e.g. the value of `MINIO_EXTERNAL_ENDPOINT`).
 */
const DEFAULT_ENDPOINT = 'http://mock-minio.local'

/** Fake ETag returned on PUT and HEAD responses. */
const MOCK_ETAG = '"mock-etag-00000000000000000000000000000000"'

/** Minimal body returned for GET object requests. */
const MOCK_BODY = '[mock] MinIO object body from Playwright test fixture.'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Installs a Playwright route intercept for browser-direct S3/MinIO requests
 * (presigned PUT/GET/DELETE/HEAD) so that E2E specs do not require a live
 * MinIO instance.
 *
 * Only the **browser-direct presigned upload** path (used by
 * `hooks/knowledge/use-knowledge-upload.ts`) is visible to `page.route()`.
 * Server-side S3 SDK calls originate from the Next.js process and are
 * therefore outside Playwright's interception scope — those are handled by
 * disabling S3 storage in test config (no `S3_BUCKET_NAME` / `AWS_REGION`).
 *
 * When the env var `MINIO_ENDPOINT` is set, this function is a **no-op** so
 * that live-mode CI runs hit the real MinIO container.
 *
 * @param page - Playwright `Page` instance.
 * @param opts - Optional configuration; see {@link MockMinioOptions}.
 */
export async function mockMinio(page: Page, opts?: MockMinioOptions): Promise<void> {
  // Live-mode bypass — skip interception when a real MinIO endpoint is configured.
  if (process.env.MINIO_ENDPOINT) {
    return
  }

  const endpoint = (opts?.endpoint ?? DEFAULT_ENDPOINT).replace(/\/+$/, '')
  const failOnCall = opts?.failOnCall ?? false

  // Build route pattern.
  // - When `opts.bucket` is provided, scope to that bucket prefix.
  // - Otherwise match everything under the endpoint (covers all buckets).
  const escapedEndpoint = endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const bucketSegment = opts?.bucket ? `/${opts.bucket.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` : ''
  const routeRegexp = new RegExp(`${escapedEndpoint}${bucketSegment}/`)

  await page.route(routeRegexp, (route) => {
    if (failOnCall) {
      return route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: '[mock-minio] Injected S3 failure.',
      })
    }

    const method = route.request().method().toUpperCase()

    switch (method) {
      case 'PUT': {
        // Presigned single-part object upload — S3 returns 200 with an ETag header.
        return route.fulfill({
          status: 200,
          headers: {
            ETag: MOCK_ETAG,
            'x-amz-request-id': 'mock-request-id-put',
          },
          body: '',
        })
      }

      case 'GET': {
        // Presigned object download — return a minimal body.
        return route.fulfill({
          status: 200,
          contentType: 'application/octet-stream',
          headers: {
            ETag: MOCK_ETAG,
            'x-amz-request-id': 'mock-request-id-get',
            'Last-Modified': new Date().toUTCString(),
          },
          body: MOCK_BODY,
        })
      }

      case 'DELETE': {
        // Object deletion — S3 returns 204 with no body.
        return route.fulfill({
          status: 204,
          headers: {
            'x-amz-request-id': 'mock-request-id-delete',
          },
          body: '',
        })
      }

      case 'HEAD': {
        // Metadata-only fetch — return headers without a body.
        return route.fulfill({
          status: 200,
          headers: {
            ETag: MOCK_ETAG,
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(MOCK_BODY.length),
            'x-amz-request-id': 'mock-request-id-head',
            'Last-Modified': new Date().toUTCString(),
          },
          body: '',
        })
      }

      default: {
        // Unrecognised method — return an XML-shaped S3 error so the app
        // sees a clear failure rather than a network-level connection drop.
        return route.fulfill({
          status: 405,
          contentType: 'application/xml',
          body: `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>MethodNotAllowed</Code>
  <Message>[mock-minio] Method ${method} is not handled by the Playwright shim.</Message>
</Error>`,
        })
      }
    }
  })
}

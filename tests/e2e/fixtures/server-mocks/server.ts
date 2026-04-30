/**
 * MSW Node.js server for server-side BFF E2E test interception.
 *
 * Loaded by `apps/crewmeld/instrumentation.ts` when `E2E_MOCK_SERVER=1` and
 * `NEXT_RUNTIME=nodejs`. The server intercepts outbound HTTP from the BFF
 * process (LLM provider calls, RAGFlow calls) that `page.route()` cannot
 * reach because they originate from the server, not the browser.
 *
 * `onUnhandledRequest: 'bypass'` is critical — it prevents MSW from blocking
 * requests to DB, Redis, auth, and other infrastructure that is NOT mocked.
 *
 * @module tests/e2e/fixtures/server-mocks/server
 */
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

/** MSW Node.js server instance pre-loaded with all E2E mock handlers. */
export const server = setupServer(...handlers)

/**
 * Starts the MSW server in bypass mode for unhandled requests.
 * Call once during Next.js instrumentation `register()`.
 */
export function startMockServer(): void {
  server.listen({ onUnhandledRequest: 'bypass' })
}

/**
 * Stops the MSW server and restores all intercepted request handlers.
 * Safe to call multiple times.
 */
export function stopMockServer(): void {
  server.close()
}

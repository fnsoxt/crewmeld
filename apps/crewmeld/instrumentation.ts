/**
 * Next.js instrumentation hook — executed once per server runtime on startup.
 *
 * When `E2E_MOCK_SERVER=1` and running in the Node.js runtime (not Edge),
 * this starts the MSW server that intercepts outbound BFF HTTP requests to
 * LLM providers and RAGFlow during Playwright E2E tests.
 *
 * Guard conditions:
 * - `E2E_MOCK_SERVER === '1'`   — opt-in env var; never active in production
 * - `NEXT_RUNTIME === 'nodejs'` — MSW node server requires Node.js; Edge is excluded
 *
 * The dynamic `import()` keeps MSW out of the production bundle entirely.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register(): Promise<void> {
  // Diagnostic: log env at instrumentation time (safe — no secrets logged)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // biome-ignore lint/suspicious/noConsole: instrumentation diagnostic
    console.log(
      '[instrumentation] E2E_MOCK_SERVER =',
      process.env.E2E_MOCK_SERVER,
      'NEXT_RUNTIME =',
      process.env.NEXT_RUNTIME
    )
  }
  if (process.env.E2E_MOCK_SERVER === '1' && process.env.NEXT_RUNTIME === 'nodejs') {
    // biome-ignore lint/suspicious/noConsole: instrumentation startup log
    console.log('[instrumentation] Starting MSW server-side mock layer...')
    const { startMockServer } = await import('../../tests/e2e/fixtures/server-mocks/server')
    startMockServer()
    // biome-ignore lint/suspicious/noConsole: instrumentation startup log
    console.log('[instrumentation] MSW server listening.')
  }
}

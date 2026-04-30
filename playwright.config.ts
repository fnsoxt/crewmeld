import { resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const AUTH_STATE_SUPER_ADMIN = resolve(__dirname, 'tests/e2e/.auth/superAdmin.json')

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  // Keep generous — dev server cold-compiles routes on first hit.
  timeout: 60_000,

  // Seed DB and prime per-role storage states before the suite starts.
  globalSetup: resolve(__dirname, 'tests/e2e/fixtures/seed.ts'),

  use: {
    baseURL: 'http://localhost:6100',
    trace: 'on-first-retry',
    headless: true,
    // Default every test to the super-admin session. RBAC specs override by
    // calling `loginAs(page, 'admin' | 'member')` which issues a fresh login.
    storageState: AUTH_STATE_SUPER_ADMIN,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    ...(process.env.E2E_LIVE === '1'
      ? [
          {
            name: 'chromium-live',
            testDir: './tests/e2e-live',
            use: { ...devices['Desktop Chrome'] },
          },
        ]
      : []),
  ],

  webServer: {
    command: 'bun run --cwd apps/crewmeld dev',
    url: 'http://localhost:6100',
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      // P2 Wave 2: run with real auth so RBAC specs can verify permissions.
      // Every E2E spec must loginAs(...) before hitting protected pages.
      DISABLE_AUTH: 'false',
      // P6: enable MSW server-side mock layer so BFF outbound HTTP (LLM
      // providers, RAGFlow) is intercepted in the Next.js Node process.
      // page.route() only intercepts browser-originated requests; this covers
      // the server side. See apps/crewmeld/instrumentation.ts.
      E2E_MOCK_SERVER: '1',
    },
  },
})

import * as fs from 'node:fs'
import * as path from 'node:path'
import { test as base, expect } from '@playwright/test'

const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const SCREENSHOT_DIR = path.join(process.cwd(), 'temp', TIMESTAMP)

/**
 * Extended test fixture that captures a full-page screenshot after each passing
 * test. The super-admin session is pre-provisioned by the globalSetup via
 * `projects[].use.storageState`, so every spec already has a valid better-auth
 * cookie on entry.
 *
 * Screenshot layout: `temp/{timestamp}/{suite-name}/{test-name}.png`.
 */
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    await use(page)

    if (testInfo.status === 'passed') {
      const suiteName = path.basename(testInfo.file, '.spec.ts')
      const testName = testInfo.title.replace(/[^a-zA-Z0-9一-鿿_-]/g, '_').slice(0, 120)
      const dir = path.join(SCREENSHOT_DIR, suiteName)
      fs.mkdirSync(dir, { recursive: true })

      // Evidence-only; don't let a flaky screenshot (e.g. the browser is
      // mid-navigation when the teardown runs) fail a passing test.
      try {
        await page.screenshot({
          path: path.join(dir, `${testName}.png`),
          fullPage: true,
          timeout: 5_000,
        })
      } catch (err) {
        testInfo.attach('screenshot-error', {
          body: err instanceof Error ? err.message : String(err),
          contentType: 'text/plain',
        })
      }
    }
  },
})

export { expect }

/**
 * Shared Vitest setup file for the testing package.
 *
 * Import this in your `vitest.config.ts` to get common mocks and lifecycle hooks.
 *
 * @example
 * ```ts
 * // vitest.config.ts
 * export default defineConfig({
 *   test: {
 *     setupFiles: ['@crewmeld/testing/setup'],
 *   },
 * })
 * ```
 */

import { afterEach, beforeEach, vi } from 'vitest'
import { setupGlobalFetchMock } from '../mocks/fetch.mock'
import { createMockLogger } from '../mocks/logger.mock'
import { clearStorageMocks, setupGlobalStorageMocks } from '../mocks/storage.mock'

// ─── global setup ─────────────────────────────────────────────────────────────

setupGlobalStorageMocks()

// Default fetch mock returns an empty JSON object
setupGlobalFetchMock({ json: {} })

// ─── per-test lifecycle ───────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearStorageMocks()
})

// ─── re-exports for test authoring ───────────────────────────────────────────

export { createMockLogger }
export { clearStorageMocks, setupGlobalStorageMocks }
export {
  mockFetchError,
  mockNextFetchResponse,
  setupGlobalFetchMock,
} from '../mocks/fetch.mock'

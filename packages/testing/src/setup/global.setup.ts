/**
 * Global setup utilities that run once before all tests in a suite.
 *
 * Use these for expensive one-time setup (e.g. starting a server, seeding a
 * database) that should not be repeated per test file.
 */

import { vi } from 'vitest'

// ─── console suppression ──────────────────────────────────────────────────────

/**
 * Suppress `console.warn` and `console.error` output that matches any of the
 * provided regex patterns.  Call this in a `beforeAll` hook.
 */
export function suppressConsoleWarnings(patterns: RegExp[]): void {
  const originalWarn = console.warn
  const originalError = console.error

  const shouldSuppress = (args: unknown[]): boolean => {
    const message = args.join(' ')
    return patterns.some((re) => re.test(message))
  }

  console.warn = (...args: unknown[]) => {
    if (!shouldSuppress(args)) originalWarn.apply(console, args)
  }

  console.error = (...args: unknown[]) => {
    if (!shouldSuppress(args)) originalError.apply(console, args)
  }
}

/**
 * Commonly suppressed patterns across the test suite.
 * Pass to {@link suppressConsoleWarnings} in suites that generate noise.
 */
export const COMMON_SUPPRESS_PATTERNS: RegExp[] = [
  /Zustand.*persist middleware/i,
  /React does not recognize the.*prop/,
  /Warning: Invalid DOM property/,
  /act\(\) warning/,
]

// ─── environment stubs ────────────────────────────────────────────────────────

/**
 * Stub minimal browser globals (`window`, `document`) when running in a
 * Node.js test environment that does not provide them.
 */
export function setupNodeEnvironment(): void {
  if (typeof window === 'undefined') {
    vi.stubGlobal('window', {
      location: { href: 'http://localhost:3000' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  }

  if (typeof document === 'undefined') {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        style: {},
        setAttribute: vi.fn(),
        appendChild: vi.fn(),
      })),
      body: { appendChild: vi.fn() },
    })
  }
}

/**
 * Remove all global stubs created by {@link setupNodeEnvironment} or other
 * `vi.stubGlobal` calls.  Call this in an `afterAll` hook.
 */
export function cleanupGlobalMocks(): void {
  vi.unstubAllGlobals()
}

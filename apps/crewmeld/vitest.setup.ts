import {
  drizzleOrmMock,
  loggerMock,
  setupGlobalFetchMock,
  setupGlobalStorageMocks,
} from '@crewmeld/testing'
import { afterAll, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

// ─── global mocks ─────────────────────────────────────────────────────────────

setupGlobalFetchMock()
setupGlobalStorageMocks()

vi.mock('drizzle-orm', () => drizzleOrmMock)
vi.mock('@crewmeld/logger', () => loggerMock)

// ─── store mocks ──────────────────────────────────────────────────────────────

vi.mock('@/stores/console/store', () => ({
  useConsoleStore: {
    getState: vi.fn().mockReturnValue({
      addConsole: vi.fn(),
    }),
  },
}))

vi.mock('@/stores/terminal', () => ({
  useTerminalConsoleStore: {
    getState: vi.fn().mockReturnValue({
      addConsole: vi.fn(),
      updateConsole: vi.fn(),
    }),
  },
}))

vi.mock('@/stores/execution/store', () => ({
  useExecutionStore: {
    getState: vi.fn().mockReturnValue({
      getWorkflowExecution: vi.fn().mockReturnValue({
        isExecuting: false,
        isDebugging: false,
        activeBlockIds: new Set(),
        pendingBlocks: [],
        executor: null,
        debugContext: null,
        lastRunPath: new Map(),
        lastRunEdges: new Map(),
      }),
      setIsExecuting: vi.fn(),
      setIsDebugging: vi.fn(),
      setPendingBlocks: vi.fn(),
      reset: vi.fn(),
      setActiveBlocks: vi.fn(),
      setBlockRunStatus: vi.fn(),
      setEdgeRunStatus: vi.fn(),
      clearRunPath: vi.fn(),
    }),
  },
  useCurrentWorkflowExecution: vi.fn().mockReturnValue({
    isExecuting: false,
    isDebugging: false,
    activeBlockIds: new Set(),
    pendingBlocks: [],
    executor: null,
    debugContext: null,
    lastRunPath: new Map(),
    lastRunEdges: new Map(),
  }),
  useIsBlockActive: vi.fn().mockReturnValue(false),
  useLastRunPath: vi.fn().mockReturnValue(new Map()),
  useLastRunEdges: vi.fn().mockReturnValue(new Map()),
}))

vi.mock('@/blocks/registry', () => ({
  getBlock: vi.fn(() => ({
    name: 'Mock Block',
    description: 'Mock block description',
    icon: () => null,
    subBlocks: [],
    outputs: {},
  })),
  getAllBlocks: vi.fn(() => ({})),
}))

// ─── console filtering ────────────────────────────────────────────────────────

const _originalError = console.error
const _originalWarn = console.warn

/** Return `true` when the log message should be suppressed in test output. */
function isSuppressedLog(args: unknown[]): boolean {
  if (args[0] === 'Workflow execution failed:' && (args[1] as Error)?.message === 'Test error') {
    return true
  }
  if (typeof args[0] === 'string' && args[0].includes('[zustand persist middleware]')) {
    return true
  }
  return false
}

console.error = (...args: unknown[]) => {
  if (!isSuppressedLog(args)) _originalError(...args)
}

console.warn = (...args: unknown[]) => {
  if (!isSuppressedLog(args)) _originalWarn(...args)
}

afterAll(() => {
  console.error = _originalError
  console.warn = _originalWarn
})

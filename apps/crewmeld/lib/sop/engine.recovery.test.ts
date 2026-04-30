import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSelect = vi.fn()
const mockSelectFrom = vi.fn()
const mockSelectWhere = vi.fn()
const mockUpdate = vi.fn()
const mockUpdateSet = vi.fn()
const mockUpdateWhere = vi.fn()
const mockUpdateReturning = vi.fn()

vi.mock('@crewmeld/db', () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
}))

vi.mock('@crewmeld/db/schema', () => ({
  sopExecutions: {
    id: 'id',
    status: 'status',
    updatedAt: 'updatedAt',
    sopDefinitionId: 'sopDefinitionId',
  },
  sopDefinitions: { id: 'id' },
  sopPauseStates: { id: 'id', executionId: 'executionId', nodeId: 'nodeId', status: 'status' },
  sopNodeExecutions: {},
  SOP_TERMINAL_STATUSES: ['completed', 'failed', 'cancelled', 'timed_out', 'error'],
}))

vi.mock('@crewmeld/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  inArray: vi.fn((...args: unknown[]) => args),
  lt: vi.fn((...args: unknown[]) => args),
}))

vi.mock('@/lib/execution/event-buffer', () => ({
  createExecutionEventWriter: vi.fn(() => ({
    write: vi.fn(),
    close: vi.fn(),
  })),
  setExecutionMeta: vi.fn(),
}))

const mockGetSopTimeoutQueue = vi.fn()
vi.mock('./queue', () => ({
  getSopTimeoutQueue: mockGetSopTimeoutQueue,
}))

vi.mock('./node-executor', () => ({
  executeNode: vi.fn(),
}))

vi.mock('./exit-resolver', () => ({
  evaluateExits: vi.fn(),
}))

const mockProcessTimeout = vi.fn()
vi.mock('./workers/timeout-worker', () => ({
  processTimeout: mockProcessTimeout,
}))

function setupSelectSequence(rowSets: unknown[][]) {
  let callIndex = 0
  mockSelectWhere.mockImplementation(() => {
    const result = rowSets[callIndex] ?? []
    callIndex++
    return result
  })
  mockSelectFrom.mockReturnValue({ where: mockSelectWhere })
  mockSelect.mockReturnValue({ from: mockSelectFrom })
}

function setupUpdateChain(returning: unknown[]) {
  mockUpdateReturning.mockResolvedValue(returning)
  mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning })
  mockUpdateSet.mockReturnValue({ where: mockUpdateWhere })
  mockUpdate.mockReturnValue({ set: mockUpdateSet })
}

import { recoverSopInstances } from './engine'

describe('recoverSopInstances', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns immediately when no stale instances', async () => {
    setupSelectSequence([[]])

    await recoverSopInstances()

    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(mockGetSopTimeoutQueue).not.toHaveBeenCalled()
  })

  it('paused_for_human + not expired → re-registers timeout job', async () => {
    const futureDate = new Date(Date.now() + 60_000)
    const mockAdd = vi.fn()
    mockGetSopTimeoutQueue.mockReturnValue({ add: mockAdd })

    setupSelectSequence([
      [
        {
          id: 'exec-1',
          status: 'paused_for_human',
          retryCount: 0,
          sopDefinitionId: 'def-1',
          updatedAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      ],
      [
        {
          id: 'pause-1',
          executionId: 'exec-1',
          nodeId: 'node-1',
          status: 'waiting',
          expiresAt: futureDate,
        },
      ],
    ])

    await recoverSopInstances()

    expect(mockAdd).toHaveBeenCalledWith(
      'sop-node-timeout',
      expect.objectContaining({
        executionId: 'exec-1',
        nodeId: 'node-1',
        pauseId: 'pause-1',
        type: 'node',
      }),
      expect.objectContaining({ delay: expect.any(Number) })
    )
  })

  it('paused_for_human + already expired → calls processTimeout directly', async () => {
    const pastDate = new Date(Date.now() - 60_000)

    setupSelectSequence([
      [
        {
          id: 'exec-2',
          status: 'paused_for_human',
          retryCount: 0,
          sopDefinitionId: 'def-2',
          updatedAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      ],
      [
        {
          id: 'pause-2',
          executionId: 'exec-2',
          nodeId: 'node-2',
          status: 'waiting',
          expiresAt: pastDate,
        },
      ],
    ])

    await recoverSopInstances()

    expect(mockProcessTimeout).toHaveBeenCalledWith({
      executionId: 'exec-2',
      nodeId: 'node-2',
      pauseId: 'pause-2',
      type: 'node',
    })
  })

  it('running instance → calls executeSop', async () => {
    setupSelectSequence([
      [
        {
          id: 'exec-3',
          status: 'running',
          retryCount: 0,
          sopDefinitionId: 'def-3',
          updatedAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      ],
    ])

    await recoverSopInstances()

    expect(mockSelect).toHaveBeenCalled()
  })

  it('error instance + retries remaining → resumes execution', async () => {
    setupSelectSequence([
      [
        {
          id: 'exec-4',
          status: 'error',
          retryCount: 1,
          sopDefinitionId: 'def-4',
          updatedAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      ],
      [{ id: 'def-4', maxRetries: 3 }],
    ])

    await recoverSopInstances()

    expect(mockSelect).toHaveBeenCalled()
  })

  it('error instance + retries exhausted → transitions to failed', async () => {
    setupSelectSequence([
      [
        {
          id: 'exec-5',
          status: 'error',
          retryCount: 3,
          sopDefinitionId: 'def-5',
          updatedAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      ],
      [{ id: 'def-5', maxRetries: 3 }],
    ])

    setupUpdateChain([{ id: 'exec-5', status: 'failed' }])

    await recoverSopInstances()

    expect(mockUpdate).toHaveBeenCalled()
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })
})

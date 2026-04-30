'use client'

import type { SandboxRunStatus } from '@crewmeld/db/schema'
import { create } from 'zustand'
import type { InterceptedCall, SandboxNodeResult, SandboxSSEEvent } from '@/types/sandbox'

interface SandboxState {
  activeSandboxRunId: string | null
  isSandboxMode: boolean
  status: SandboxRunStatus
  nodeResults: SandboxNodeResult[]
  interceptedCalls: InterceptedCall[]
  executionPath: string[]
  elapsedTime: number

  startSandbox: (runId: string) => void
  stopSandbox: () => void
  updateFromSSE: (event: SandboxSSEEvent) => void
  reset: () => void
  setElapsedTime: (ms: number) => void
}

const INITIAL_STATE = {
  activeSandboxRunId: null,
  isSandboxMode: false,
  status: 'pending' as SandboxRunStatus,
  nodeResults: [] as SandboxNodeResult[],
  interceptedCalls: [] as InterceptedCall[],
  executionPath: [] as string[],
  elapsedTime: 0,
}

export const useSandboxStore = create<SandboxState>((set, get) => ({
  ...INITIAL_STATE,

  startSandbox: (runId: string) => {
    set({
      activeSandboxRunId: runId,
      isSandboxMode: true,
      status: 'running',
      nodeResults: [],
      interceptedCalls: [],
      executionPath: [],
      elapsedTime: 0,
    })
  },

  stopSandbox: () => {
    set({
      isSandboxMode: false,
      status: 'cancelled',
    })
  },

  updateFromSSE: (event: SandboxSSEEvent) => {
    const state = get()
    if (event.runId !== state.activeSandboxRunId) return

    switch (event.type) {
      case 'sandbox:started':
        set({ status: 'running' })
        break
      case 'sandbox:block:started':
        set({
          executionPath: [...state.executionPath, event.data.nodeId as string],
        })
        break
      case 'sandbox:block:completed':
      case 'sandbox:block:error':
      case 'sandbox:block:intercepted': {
        const result = event.data as unknown as SandboxNodeResult
        set({ nodeResults: [...state.nodeResults, result] })
        if (result.intercepted) {
          const call: InterceptedCall = {
            type: (event.data.interceptType as InterceptedCall['type']) ?? 'push',
            channel: (event.data.channel as string) ?? result.blockType,
            target: (event.data.target as string) ?? '',
            content: result.preview ?? '',
            nodeId: result.nodeId,
            timestamp: event.timestamp,
          }
          set({ interceptedCalls: [...state.interceptedCalls, call] })
        }
        break
      }
      case 'sandbox:waiting_for_input':
        set({ status: 'waiting_for_input' })
        break
      case 'sandbox:completed':
        set({
          status: 'completed',
          isSandboxMode: false,
        })
        break
      case 'sandbox:error':
        set({
          status: 'failed',
          isSandboxMode: false,
        })
        break
      case 'sandbox:cancelled':
        set({
          status: 'cancelled',
          isSandboxMode: false,
        })
        break
    }
  },

  reset: () => {
    set(INITIAL_STATE)
  },

  setElapsedTime: (ms: number) => {
    set({ elapsedTime: ms })
  },
}))

'use client'

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { SopEventType, SopExecutionEvent } from '@/types/sop'

interface SopNodeExecState {
  nodeId: string
  status: 'pending' | 'running' | 'completed' | 'error' | 'paused'
  startedAt?: string
  completedAt?: string
  output?: Record<string, unknown>
}

interface SopExecutionState {
  /** Current execution being tracked */
  executionId: string | null
  sopDefinitionId: string | null
  status: string | null
  events: SopExecutionEvent[]
  nodeStates: Map<string, SopNodeExecState>

  /** SSE connection state */
  isConnected: boolean
  error: string | null
}

interface SopExecutionActions {
  /** Start tracking an execution via SSE */
  startTracking: (sopDefinitionId: string, executionId: string) => void

  /** Stop tracking (disconnect SSE) */
  stopTracking: () => void

  /** Process an incoming SSE event */
  processEvent: (event: SopExecutionEvent) => void

  /** Reset store */
  reset: () => void
}

const INITIAL_STATE: SopExecutionState = {
  executionId: null,
  sopDefinitionId: null,
  status: null,
  events: [],
  nodeStates: new Map(),
  isConnected: false,
  error: null,
}

let eventSource: EventSource | null = null

export const useSopExecutionStore = create<SopExecutionState & SopExecutionActions>()(
  devtools(
    (set, get) => ({
      ...INITIAL_STATE,

      startTracking: (sopDefinitionId, executionId) => {
        const current = get()
        if (current.executionId === executionId && current.isConnected) return

        if (eventSource) {
          eventSource.close()
          eventSource = null
        }

        set({
          executionId,
          sopDefinitionId,
          status: 'running',
          events: [],
          nodeStates: new Map(),
          isConnected: true,
          error: null,
        })

        const url = `/api/employee/sops/${sopDefinitionId}/executions/${executionId}/stream`
        const es = new EventSource(url)
        eventSource = es

        es.onmessage = (e) => {
          try {
            const event = JSON.parse(e.data) as SopExecutionEvent | { type: 'done' }
            if (event.type === 'done') {
              es.close()
              eventSource = null
              set({ isConnected: false })
              return
            }
            get().processEvent(event as SopExecutionEvent)
          } catch {
            // Ignore malformed events
          }
        }

        es.onerror = () => {
          es.close()
          eventSource = null
          set({ isConnected: false, error: 'Connection lost' })
        }
      },

      stopTracking: () => {
        if (eventSource) {
          eventSource.close()
          eventSource = null
        }
        set({ isConnected: false })
      },

      processEvent: (event) => {
        set((state) => {
          const events = [...state.events, event]
          const nodeStates = new Map(state.nodeStates)
          let status = state.status

          switch (event.type as SopEventType) {
            case 'sop:started':
              status = 'running'
              break

            case 'sop:node:started':
              if (event.nodeId) {
                nodeStates.set(event.nodeId, {
                  nodeId: event.nodeId,
                  status: 'running',
                  startedAt: event.timestamp,
                })
              }
              break

            case 'sop:node:completed':
              if (event.nodeId) {
                const existing = nodeStates.get(event.nodeId)
                nodeStates.set(event.nodeId, {
                  ...existing,
                  nodeId: event.nodeId,
                  status: 'completed',
                  completedAt: event.timestamp,
                  output: event.data,
                })
              }
              break

            case 'sop:node:error':
              if (event.nodeId) {
                const existing = nodeStates.get(event.nodeId)
                nodeStates.set(event.nodeId, {
                  ...existing,
                  nodeId: event.nodeId,
                  status: 'error',
                  completedAt: event.timestamp,
                })
              }
              break

            case 'sop:paused':
              if (event.nodeId) {
                const existing = nodeStates.get(event.nodeId)
                nodeStates.set(event.nodeId, {
                  ...existing,
                  nodeId: event.nodeId,
                  status: 'paused',
                })
              }
              status = 'paused_for_human'
              break

            case 'sop:resumed':
              status = 'running'
              break

            case 'sop:completed':
              status = 'completed'
              break

            case 'sop:error':
              status = 'error'
              break

            case 'sop:timed_out':
              status = 'timed_out'
              break

            case 'sop:cancelled':
              status = 'cancelled'
              break
          }

          return { events, nodeStates, status }
        })
      },

      reset: () => {
        if (eventSource) {
          eventSource.close()
          eventSource = null
        }
        set(INITIAL_STATE)
      },
    }),
    { name: 'sop-execution-store' }
  )
)

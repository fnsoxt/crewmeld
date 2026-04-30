'use client'

import { create } from 'zustand'

interface VariableCacheState {
  /** Cached node outputs keyed by nodeId */
  nodeOutputs: Record<string, Record<string, unknown>>
  /** Manual input overrides keyed by nodeId */
  nodeInputOverrides: Record<string, Record<string, unknown>>

  init: () => void
  cacheOutput: (nodeId: string, output: Record<string, unknown>) => void
  getUpstreamVariables: (
    nodeId: string,
    edges: Array<{ source: string; target: string }>
  ) => Record<string, Record<string, unknown>>
  overrideInput: (nodeId: string, input: Record<string, unknown>) => void
  clearNode: (nodeId: string) => void
  clearAll: () => void
}

export const useVariableCacheStore = create<VariableCacheState>((set, get) => ({
  nodeOutputs: {},
  nodeInputOverrides: {},

  init: () => {
    set({ nodeOutputs: {}, nodeInputOverrides: {} })
  },

  cacheOutput: (nodeId: string, output: Record<string, unknown>) => {
    set((state) => ({
      nodeOutputs: {
        ...state.nodeOutputs,
        [nodeId]: output,
      },
    }))
  },

  getUpstreamVariables: (nodeId: string, edges: Array<{ source: string; target: string }>) => {
    const { nodeOutputs } = get()
    const upstreamNodeIds = edges.filter((e) => e.target === nodeId).map((e) => e.source)

    const variables: Record<string, Record<string, unknown>> = {}
    for (const id of upstreamNodeIds) {
      if (nodeOutputs[id]) {
        variables[id] = nodeOutputs[id]
      }
    }
    return variables
  },

  overrideInput: (nodeId: string, input: Record<string, unknown>) => {
    set((state) => ({
      nodeInputOverrides: {
        ...state.nodeInputOverrides,
        [nodeId]: input,
      },
    }))
  },

  clearNode: (nodeId: string) => {
    set((state) => {
      const { [nodeId]: _out, ...restOutputs } = state.nodeOutputs
      const { [nodeId]: _in, ...restOverrides } = state.nodeInputOverrides
      return {
        nodeOutputs: restOutputs,
        nodeInputOverrides: restOverrides,
      }
    })
  },

  clearAll: () => {
    set({ nodeOutputs: {}, nodeInputOverrides: {} })
  },
}))

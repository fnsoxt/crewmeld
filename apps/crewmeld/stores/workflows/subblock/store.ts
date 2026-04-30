/**
 * Sub-block store stub — the workflow canvas editor has been removed.
 * A minimal Zustand store is provided so the variables layer compiles
 * and runs without errors.
 */

import { create } from 'zustand'

export interface SubBlockStoreState {
  workflowValues: Record<string, Record<string, Record<string, unknown>>>
}

export const useSubBlockStore = create<SubBlockStoreState>()(() => ({
  workflowValues: {},
}))

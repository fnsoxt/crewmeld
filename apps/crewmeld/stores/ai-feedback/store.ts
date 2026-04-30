import { create } from 'zustand'

type AiFeedbackType = 'added' | 'modified' | 'deleted'

interface AiFeedbackState {
  animatingNodes: Map<string, AiFeedbackType>
}

interface AiFeedbackActions {
  markAdded: (ids: string[]) => void
  markModified: (ids: string[]) => void
  markDeleted: (ids: string[]) => void
  clearNode: (id: string) => void
  clearAll: () => void
}

export const useAiFeedbackStore = create<AiFeedbackState & AiFeedbackActions>()((set, get) => ({
  animatingNodes: new Map(),

  markAdded: (ids) => {
    const next = new Map(get().animatingNodes)
    for (const id of ids) next.set(id, 'added')
    set({ animatingNodes: next })

    setTimeout(() => {
      const current = get().animatingNodes
      const cleaned = new Map(current)
      let changed = false
      for (const id of ids) {
        if (cleaned.get(id) === 'added') {
          cleaned.delete(id)
          changed = true
        }
      }
      if (changed) set({ animatingNodes: cleaned })
    }, 1500)
  },

  markModified: (ids) => {
    const next = new Map(get().animatingNodes)
    for (const id of ids) next.set(id, 'modified')
    set({ animatingNodes: next })

    setTimeout(() => {
      const current = get().animatingNodes
      const cleaned = new Map(current)
      let changed = false
      for (const id of ids) {
        if (cleaned.get(id) === 'modified') {
          cleaned.delete(id)
          changed = true
        }
      }
      if (changed) set({ animatingNodes: cleaned })
    }, 600)
  },

  markDeleted: (ids) => {
    const next = new Map(get().animatingNodes)
    for (const id of ids) next.set(id, 'deleted')
    set({ animatingNodes: next })
  },

  clearNode: (id) => {
    const next = new Map(get().animatingNodes)
    next.delete(id)
    set({ animatingNodes: next })
  },

  clearAll: () => {
    set({ animatingNodes: new Map() })
  },
}))

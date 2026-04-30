/**
 * Workflow store utility stubs — the workflow canvas editor has been removed.
 * Minimal utilities are exported to satisfy imports from the undo-redo layer.
 */

import type { BlockState } from './workflow/types'

/**
 * Merges sub-block values from the sub-block store into the block state.
 * Returns the blocks map unchanged (no-op stub since the sub-block store is empty).
 */
export function mergeSubblockState(
  blocks: Record<string, BlockState>,
  _workflowId: string,
  _blockId?: string
): Record<string, BlockState> {
  return blocks
}

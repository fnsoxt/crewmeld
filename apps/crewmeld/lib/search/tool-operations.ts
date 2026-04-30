/**
 * Search tool-operations index stub — builds the index of tool operations
 * used in the command-palette search. Returns empty list since the block
 * registry has been removed from CrewMeld.
 */

import type { ComponentType } from 'react'

export interface SearchToolOperationItem {
  id: string
  name: string
  searchValue: string
  icon: ComponentType<{ className?: string }>
  bgColor: string
  blockType: string
  operationId: string
  /** Alternative names / aliases for this operation used in search. */
  aliases?: string[]
  /** Display name of the operation. */
  operationName?: string
  /** Display name of the service this operation belongs to. */
  serviceName?: string
}

/** Returns the indexed list of tool operations for search. Always empty in CrewMeld. */
export function getToolOperationsIndex(): SearchToolOperationItem[] {
  return []
}

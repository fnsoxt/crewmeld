/**
 * Global provider registry for CrewMeld LLM adapters.
 */

import type { ProviderConfig } from './contracts'

/**
 * Keyed map of all registered provider adapters.
 * Each provider's module populates this map as a side effect at load time.
 */
export const providers: Record<string, ProviderConfig> = {}

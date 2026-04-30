/**
 * ProviderMetadata type — client-safe provider descriptor containing only
 * model lists and patterns, with no server-side executeRequest implementation.
 * For server-side execution use @/providers/registry instead.
 */
export interface ProviderMetadata {
  id: string
  name: string
  description: string
  version: string
  models: string[]
  defaultModel: string
  computerUseModels?: string[]
  modelPatterns?: RegExp[]
}

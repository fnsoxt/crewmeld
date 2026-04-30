export type ProviderName = 'ollama' | 'vllm' | 'base'

/** Model info entry returned by the OpenRouter API. */
export interface OpenRouterModelInfo {
  id: string
  name: string
  description?: string
  context_length?: number
  pricing?: {
    prompt?: string
    completion?: string
  }
  supportsStructuredOutputs?: boolean
}

export interface ProviderState {
  models: string[]
  isLoading: boolean
}

export interface ProvidersStore {
  providers: Record<ProviderName, ProviderState>
  openRouterModelInfo: Record<string, OpenRouterModelInfo>
  setProviderModels: (provider: ProviderName, models: string[]) => void
  setProviderLoading: (provider: ProviderName, isLoading: boolean) => void
  getProvider: (provider: ProviderName) => ProviderState
  setOpenRouterModelInfo: (modelInfo: Record<string, OpenRouterModelInfo>) => void
  getOpenRouterModelInfo: (modelId: string) => OpenRouterModelInfo | undefined
}

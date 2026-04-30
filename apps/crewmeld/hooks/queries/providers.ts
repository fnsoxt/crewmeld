import { createLogger } from '@crewmeld/logger'
import { useQuery } from '@tanstack/react-query'
import type { ProviderName } from '@/stores/providers'

const logger = createLogger('ProviderModelsQuery')

const providerEndpoints: Record<ProviderName, string> = {
  base: '/api/providers/base/models',
  ollama: '/api/providers/ollama/models',
  vllm: '/api/providers/vllm/models',
}

interface ProviderModelsResponse {
  models: string[]
}

async function fetchProviderModels(provider: ProviderName): Promise<ProviderModelsResponse> {
  const response = await fetch(providerEndpoints[provider])

  if (!response.ok) {
    logger.warn(`Failed to fetch ${provider} models`, {
      status: response.status,
      statusText: response.statusText,
    })
    throw new Error(`Failed to fetch ${provider} models`)
  }

  const data = await response.json()
  const models: string[] = Array.isArray(data.models) ? data.models : []

  return {
    models,
  }
}

export function useProviderModels(provider: ProviderName) {
  return useQuery({
    queryKey: ['provider-models', provider],
    queryFn: () => fetchProviderModels(provider),
    staleTime: 5 * 60 * 1000,
  })
}

import { createLogger } from '@crewmeld/logger'
import { t } from '@/lib/core/server-i18n'
import type { OllamaDiscoveryResult, OllamaModel } from '@/lib/models/types'

const logger = createLogger('OllamaDiscovery')

const DEFAULT_OLLAMA_ENDPOINTS = [
  'http://localhost:11434',
  'http://127.0.0.1:11434',
  'http://host.docker.internal:11434',
]

/**
 * Discover locally running Ollama instances and downloaded models
 */
export async function discoverOllamaModels(
  customEndpoint?: string,
  lang: 'zh' | 'en' = 'zh'
): Promise<OllamaDiscoveryResult> {
  const endpoints = customEndpoint ? [customEndpoint] : DEFAULT_OLLAMA_ENDPOINTS

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(`${endpoint}/api/tags`, {
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        continue
      }

      const data = (await response.json()) as {
        models: Array<{
          name: string
          size: number
          modified_at: string
          digest: string
        }>
      }

      const models: OllamaModel[] = (data.models ?? []).map((m) => ({
        name: m.name,
        size: m.size,
        modifiedAt: m.modified_at,
        digest: m.digest,
      }))

      logger.info('Ollama instance discovery succeeded', { endpoint, modelCount: models.length })

      return {
        available: true,
        endpoint,
        models,
      }
    } catch {
      logger.warn('Ollama endpoint unreachable', { endpoint })
    }
  }

  return {
    available: false,
    endpoint: '',
    models: [],
    error: t('healthOllamaNotDetected', lang),
  }
}

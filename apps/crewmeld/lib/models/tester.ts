import { createLogger } from '@crewmeld/logger'
import { t } from '@/lib/core/server-i18n'
import type { ModelTestResult } from '@/lib/models/types'
import { logModelUsage } from '@/lib/models/usage-logger'
import type { StreamingExecution } from '@/lib/types/execution'
import { getProviderExecutor } from '@/providers/registry'
import type { ProviderId, ProviderResponse } from '@/providers/types'

const logger = createLogger('ModelTester')

const TEST_TIMEOUT_MS = 30_000

/**
 * Test model connection for a specified provider
 */
export async function testModelConnection(
  providerId: string,
  apiKey: string | undefined,
  model: string,
  apiEndpoint?: string,
  lang: 'zh' | 'en' = 'zh'
): Promise<ModelTestResult> {
  const startTime = Date.now()
  const testPrompt = t('modelTestHello', lang)

  try {
    const provider = await getProviderExecutor(providerId as ProviderId)

    if (!provider) {
      return {
        success: false,
        message: t('modelTestNotRegistered', lang, { provider: providerId }),
        latencyMs: Date.now() - startTime,
        model,
      }
    }

    const request = {
      model,
      apiKey,
      messages: [{ role: 'user' as const, content: testPrompt }],
      maxTokens: 100,
      temperature: 0.1,
      ...(apiEndpoint ? { apiEndpoint } : {}),
    }

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(t('modelTestTimeout', lang))), TEST_TIMEOUT_MS)
    )

    const response = await Promise.race([provider.executeRequest(request), timeoutPromise])

    const latencyMs = Date.now() - startTime

    if (response instanceof ReadableStream || 'stream' in (response as StreamingExecution)) {
      return {
        success: true,
        message: t('modelTestStreamSuccess', lang),
        latencyMs,
        model,
      }
    }

    const providerResponse = response as ProviderResponse

    logModelUsage({
      provider: providerId,
      model: providerResponse.model || model,
      response: providerResponse,
      durationMs: latencyMs,
    })

    return {
      success: true,
      message: t('modelTestSuccess', lang),
      latencyMs,
      responsePreview: providerResponse.content.slice(0, 200),
      model,
      tokens: providerResponse.tokens
        ? {
            input: providerResponse.tokens.input ?? 0,
            output: providerResponse.tokens.output ?? 0,
            total: providerResponse.tokens.total ?? 0,
          }
        : undefined,
    }
  } catch (error) {
    const latencyMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error('Model test failed', { providerId, model, error: errorMessage })

    return {
      success: false,
      message: t('modelTestFailed', lang, { error: errorMessage }),
      latencyMs,
      model,
    }
  }
}

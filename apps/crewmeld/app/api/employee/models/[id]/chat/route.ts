import { db } from '@crewmeld/db'
import { modelConfigs } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { getSession } from '@/lib/auth'
import { decryptConfig } from '@/lib/connectors/encryption'
import { logModelUsage } from '@/lib/models/usage-logger'
import type { StreamingExecution } from '@/lib/types/execution'
import { getProviderExecutor } from '@/providers/registry'
import type { ProviderId, ProviderResponse } from '@/providers/types'

const logger = createLogger('ModelChatAPI')

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

async function _POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return apiErr('api.common.unauthorized', { status: 401 })
    }

    const { id } = await params
    const [config] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, id))
    if (!config) {
      return apiErr('api.model.notFound', { status: 404 })
    }

    const body = await request.json()
    const { messages } = body as { messages: ChatMessage[] }

    if (!Array.isArray(messages) || messages.length === 0) {
      return apiErr('api.model.messagesEmpty', { status: 400 })
    }

    const apiKey = config.apiKeyEncrypted ? decryptConfig(config.apiKeyEncrypted) : undefined
    const provider = await getProviderExecutor(config.providerId as ProviderId)

    if (!provider) {
      return apiErr('api.model.providerNotRegistered', {
        status: 400,
        params: { providerId: config.providerId },
      })
    }

    const { temperature, maxTokens } =
      (config.defaultParams as { temperature?: number; maxTokens?: number }) ?? {}
    // In E2E mock mode, use a generic fallback so providers without a
    // defaultModel (e.g. doubao, which requires an endpoint ID) can proceed.
    // MSW intercepts the outbound HTTP call, so the model name is not sent
    // to a real provider.
    // Use || (not ??) to treat empty-string defaultModel as absent.
    // In E2E mock mode, fall back to a placeholder so providers that require
    // a user-supplied endpoint ID (e.g. doubao) don't return 400.
    const e2eFallback = process.env.E2E_MOCK_SERVER === '1' ? 'e2e-mock-model' : ''
    const modelName: string = config.modelName || provider.defaultModel || e2eFallback

    if (!modelName) {
      return apiErr('api.model.modelNameMissing', { status: 400 })
    }

    logger.info('Model chat request', { id, providerId: config.providerId, model: modelName })

    const startTime = Date.now()

    const providerRequest = {
      model: modelName,
      apiKey,
      messages: messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      temperature: temperature ?? 0.7,
      maxTokens: maxTokens ?? 16384,
      ...(config.apiEndpoint ? { apiEndpoint: config.apiEndpoint } : {}),
    }

    const response = await provider.executeRequest(providerRequest)

    /** Wrap stream to write usage log after stream ends */
    function wrapWithUsageLog(
      rawStream: ReadableStream,
      getTokens?: () => { input?: number; output?: number; total?: number } | undefined
    ): ReadableStream {
      const reader = rawStream.getReader()
      return new ReadableStream({
        async pull(controller) {
          const { done, value } = await reader.read()
          if (done) {
            controller.close()
            const tokens = getTokens?.()
            logModelUsage({
              provider: config.providerId,
              model: modelName,
              userId: session?.user?.id,
              durationMs: Date.now() - startTime,
              response:
                tokens && (tokens.input || tokens.output || tokens.total)
                  ? ({ content: '', model: modelName, tokens } as ProviderResponse)
                  : undefined,
            })
            return
          }
          controller.enqueue(value)
        },
      })
    }

    const streamHeaders = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    }

    // Streaming response: pass through directly
    if (response instanceof ReadableStream) {
      return new Response(wrapWithUsageLog(response), { headers: streamHeaders })
    }

    // StreamingExecution type
    if ('stream' in (response as StreamingExecution)) {
      const streaming = response as StreamingExecution
      return new Response(
        wrapWithUsageLog(streaming.stream, () => streaming.execution?.output?.tokens),
        { headers: streamHeaders }
      )
    }

    // Non-streaming response
    const providerResponse = response as ProviderResponse
    logModelUsage({
      provider: config.providerId,
      model: providerResponse.model || modelName,
      response: providerResponse,
      userId: session.user.id,
      durationMs: Date.now() - startTime,
    })
    return apiOk({
      content: providerResponse.content,
      model: providerResponse.model,
      tokens: providerResponse.tokens,
    })
  } catch (error) {
    logger.error('Model chat failed', error)
    return apiErr('api.model.chatFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)

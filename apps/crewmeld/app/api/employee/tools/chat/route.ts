import { promises as fs } from 'fs'
import path from 'path'
import { db } from '@crewmeld/db'
import { modelConfigs, systemConnections } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { decryptConfig } from '@/lib/connectors/encryption'
import { encodeSSE, SSE_HEADERS } from '@/lib/core/utils/sse'
import { resolveLocale } from '@/lib/i18n/server-locale'
import { logModelUsage } from '@/lib/models/usage-logger'
import {
  type ApiKeyEntry,
  type ConnectionEntry,
  getToolChatSystemPrompt,
} from '@/lib/prompts/tool-chat'
import type { StreamingExecution } from '@/lib/types/execution'
import { getProviderExecutor } from '@/providers/registry'
import type { ProviderId, ProviderResponse } from '@/providers/types'

const logger = createLogger('ToolChatAPI')

// ---------------------------------------------------------------------------
// Load specs from files
// ---------------------------------------------------------------------------

const SPECS_DIR = path.join(process.cwd(), 'app/(employee)/skills/specs')

async function loadSpec(filename: string): Promise<string> {
  try {
    return await fs.readFile(path.join(SPECS_DIR, filename), 'utf-8')
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ---------------------------------------------------------------------------
// POST -- Streaming chat (SSE)
// ---------------------------------------------------------------------------

async function _POST(request: NextRequest) {
  try {
    const auth = await requirePermission('skill:edit')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const body = await request.json()
    const { modelId, messages, apiKeys, connections } = body as {
      modelId: string
      messages: ChatMessage[]
      apiKeys?: ApiKeyEntry[]
      connections?: ConnectionEntry[]
    }

    if (!modelId) {
      return apiErr('api.tool.modelRequired', { status: 400 })
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return apiErr('api.tool.messagesEmpty', { status: 400 })
    }

    const [config] = await db
      .select()
      .from(modelConfigs)
      .where(and(eq(modelConfigs.id, modelId), eq(modelConfigs.isActive, true)))

    if (!config) {
      return apiErr('api.tool.modelConfigNotFound', { status: 404 })
    }

    const apiKey = config.apiKeyEncrypted ? decryptConfig(config.apiKeyEncrypted) : undefined
    const provider = await getProviderExecutor(config.providerId as ProviderId)
    if (!provider) {
      return apiErr('api.tool.providerNotRegistered', {
        status: 400,
        params: { providerId: config.providerId },
      })
    }

    const { temperature, maxTokens } =
      (config.defaultParams as { temperature?: number; maxTokens?: number }) ?? {}
    const modelName = config.modelName ?? provider.defaultModel
    if (!modelName) {
      return apiErr('api.tool.modelNameMissing', { status: 400 })
    }

    // If frontend did not send connection info (may not have loaded yet), server auto-queries
    let effectiveConnections = connections
    if (!effectiveConnections || effectiveConnections.length === 0) {
      try {
        const connRows = await db
          .select()
          .from(systemConnections)
          .where(eq(systemConnections.status, 'connected'))

        if (connRows.length > 0) {
          effectiveConnections = connRows.map((row) => {
            let config: Record<string, unknown> = {}
            try {
              config = JSON.parse(decryptConfig(row.configEncrypted))
            } catch {
              /* skip */
            }

            const envVars: Array<{ envName: string; label: string }> = []
            for (const [key, val] of Object.entries(config)) {
              if (val != null && String(val).trim()) {
                envVars.push({
                  envName: `CONN_${key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}`,
                  label: key,
                })
              }
            }

            return {
              name: row.name,
              type: row.type,
              dbType: row.type === 'database' ? (config.dbType as string | undefined) : undefined,
              typeLabel: row.type,
              envVars,
            }
          })
        }
      } catch (err) {
        logger.warn('Failed to auto-load system connections', { error: err })
      }
    }

    const locale = resolveLocale(request)
    const [codeSpec, securitySpec, inputReqSpec, testingSpec] = await Promise.all([
      loadSpec('code-generation.md'),
      loadSpec('security-check.md'),
      loadSpec('input-requirements.md'),
      loadSpec('testing.md'),
    ])
    const systemPrompt = await getToolChatSystemPrompt(locale, apiKeys, effectiveConnections, {
      codeSpec,
      securitySpec,
      inputReqSpec,
      testingSpec,
    })

    logger.info('Tool chat request', {
      modelId,
      providerId: config.providerId,
      messagesCount: messages.length,
      locale,
    })

    const startTime = Date.now()

    const providerRequest = {
      model: modelName,
      apiKey,
      systemPrompt,
      messages: messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      temperature: temperature ?? 0.3,
      maxTokens: maxTokens ?? 16384,
      stream: true,
      ...(config.apiEndpoint ? { apiEndpoint: config.apiEndpoint } : {}),
    }

    const response = await provider.executeRequest(providerRequest)

    // Unify various provider stream formats into standard SSE (data: {"chunk":"..."}\n\n)
    // onStreamEnd callback after stream ends, passing usage extracted from SSE
    function wrapStreamToSSE(
      rawStream: ReadableStream,
      onStreamEnd?: (usage: { input: number; output: number; total: number } | null) => void
    ): ReadableStream {
      const reader = rawStream.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      // null = not yet detected, true = SSE format, false = plain text
      let isSSEFormat: boolean | null = null
      // Token usage extracted from SSE stream
      let extractedUsage: { input: number; output: number; total: number } | null = null

      return new ReadableStream({
        async pull(controller) {
          try {
            const { done, value } = await reader.read()
            if (done) {
              // Process remaining data in buffer
              if (buffer.trim()) {
                if (isSSEFormat) {
                  processBuffer(buffer, controller)
                } else {
                  controller.enqueue(encodeSSE({ chunk: buffer }))
                }
              }
              controller.enqueue(encodeSSE({ done: true }))
              controller.close()
              // Callback after stream ends
              onStreamEnd?.(extractedUsage)
              return
            }

            const decoded = decoder.decode(value, { stream: true })

            // First-time format detection: SSE starts with "data: " / "event:" / ":"
            if (isSSEFormat === null && decoded.trim()) {
              const trimmed = decoded.trimStart()
              isSSEFormat =
                trimmed.startsWith('data: ') ||
                trimmed.startsWith('event:') ||
                trimmed.startsWith(':')
            }

            // Plain text stream: each chunk is sent as SSE directly, no line buffering needed
            if (isSSEFormat === false) {
              if (decoded) {
                controller.enqueue(encodeSSE({ chunk: decoded }))
              }
              return
            }

            // SSE format stream: split and parse by line
            buffer += decoded
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              processBuffer(line, controller)
            }
          } catch (err) {
            controller.enqueue(
              encodeSSE({ error: err instanceof Error ? err.message : String(err) })
            )
            controller.close()
            onStreamEnd?.(extractedUsage)
          }
        },
      })

      // Extract usage from parsed JSON in SSE chunk
      function tryExtractUsage(parsed: Record<string, unknown>) {
        const usage = parsed.usage as Record<string, number> | undefined
        if (usage && typeof usage === 'object') {
          extractedUsage = {
            input: usage.prompt_tokens ?? 0,
            output: usage.completion_tokens ?? 0,
            total:
              usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
          }
        }
      }

      function processBuffer(line: string, controller: ReadableStreamDefaultController) {
        const trimmed = line.trim()
        if (!trimmed) return

        // Already in SSE data: format
        if (trimmed.startsWith('data: ')) {
          const payload = trimmed.slice(6)
          if (payload === '[DONE]') {
            controller.enqueue(encodeSSE({ done: true }))
            return
          }
          try {
            const parsed = JSON.parse(payload)
            tryExtractUsage(parsed)
            // OpenAI compatible format
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              controller.enqueue(encodeSSE({ chunk: content }))
            }
            // Anthropic content_block_delta
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              controller.enqueue(encodeSSE({ chunk: parsed.delta.text }))
            }
            // Already in our format
            if (parsed.chunk) {
              controller.enqueue(encodeSSE({ chunk: parsed.chunk }))
            }
          } catch {
            // Not JSON, treat as plain text
            controller.enqueue(encodeSSE({ chunk: payload }))
          }
          return
        }

        // Not SSE format, possibly raw text
        if (
          !trimmed.startsWith(':') &&
          !trimmed.startsWith('event:') &&
          !trimmed.startsWith('id:') &&
          !trimmed.startsWith('retry:')
        ) {
          try {
            const parsed = JSON.parse(trimmed)
            tryExtractUsage(parsed)
            const content = parsed.choices?.[0]?.delta?.content ?? parsed.chunk
            if (content) controller.enqueue(encodeSSE({ chunk: content }))
          } catch {
            // Plain text chunk
            controller.enqueue(encodeSSE({ chunk: trimmed }))
          }
        }
      }
    }

    /** Common callback to write usage log after stream ends */
    function logAfterStream(usage: { input: number; output: number; total: number } | null) {
      const durationMs = Date.now() - startTime
      logModelUsage({
        provider: config.providerId,
        model: modelName,
        userId: auth.userId!,
        durationMs,
        response: usage
          ? ({ content: '', model: modelName, tokens: usage } as ProviderResponse)
          : undefined,
      })
    }

    // Streaming response
    if (response instanceof ReadableStream) {
      return new Response(wrapStreamToSSE(response, logAfterStream), { headers: SSE_HEADERS })
    }

    if ('stream' in (response as StreamingExecution)) {
      const streaming = response as StreamingExecution
      return new Response(
        wrapStreamToSSE(streaming.stream, (sseUsage) => {
          // Prefer tokens from execution.output populated by provider onComplete callback
          const execTokens = streaming.execution?.output?.tokens
          const usage =
            execTokens && (execTokens.input || execTokens.output || execTokens.total)
              ? {
                  input: execTokens.input ?? 0,
                  output: execTokens.output ?? 0,
                  total: execTokens.total ?? 0,
                }
              : sseUsage
          logAfterStream(usage)
        }),
        { headers: SSE_HEADERS }
      )
    }

    // Non-streaming fallback
    const providerResponse = response as ProviderResponse
    logModelUsage({
      provider: config.providerId,
      model: modelName,
      userId: auth.userId!,
      response: providerResponse,
      durationMs: Date.now() - startTime,
    })
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encodeSSE({ chunk: providerResponse.content }))
        controller.enqueue(encodeSSE({ done: true }))
        controller.close()
      },
    })

    return new Response(stream, { headers: SSE_HEADERS })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error('Tool chat failed', { error: msg })
    return apiErr('api.tool.chatFailed', { status: 500, extra: { detail: msg } })
  }
}

export const POST = withAudit(_POST)

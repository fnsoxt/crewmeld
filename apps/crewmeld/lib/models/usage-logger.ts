import { db } from '@crewmeld/db'
import { modelUsageLogs } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { nanoid } from 'nanoid'
import type { ProviderResponse } from '@/providers/types'

const logger = createLogger('ModelUsageLogger')

interface UsageLogParams {
  provider: string
  model: string
  response?: ProviderResponse | null
  durationMs?: number
  workflowId?: string
  workspaceId?: string
  userId?: string
  employeeId?: string
  status?: 'success' | 'error'
  errorMessage?: string
}

/**
 * Asynchronously write model usage logs (fire-and-forget).
 * Can be used wherever LLM calls are made.
 */
export function logModelUsage(params: UsageLogParams): void {
  const id = nanoid()
  const values = {
    id,
    provider: params.provider,
    model: params.model,
    tokensInput: params.response?.tokens?.input ?? 0,
    tokensOutput: params.response?.tokens?.output ?? 0,
    tokensTotal: params.response?.tokens?.total ?? 0,
    costInput: String(params.response?.cost?.input ?? 0),
    costOutput: String(params.response?.cost?.output ?? 0),
    costTotal: String(params.response?.cost?.total ?? 0),
    durationMs:
      params.durationMs ??
      (params.response?.timing?.duration ? Math.round(params.response.timing.duration) : null),
    workflowId: params.workflowId ?? null,
    workspaceId: params.workspaceId ?? null,
    userId: params.userId ?? null,
    employeeId: params.employeeId ?? null,
    status: params.status ?? 'success',
    errorMessage: params.errorMessage ?? null,
  }

  logger.info('[Write] Starting model call log write', {
    id,
    provider: values.provider,
    model: values.model,
    tokensTotal: values.tokensTotal,
    costTotal: values.costTotal,
    status: values.status,
    userId: values.userId,
  })

  db.insert(modelUsageLogs)
    .values(values)
    .then(() => {
      logger.info('[Write] Model call log write succeeded', {
        id,
        provider: values.provider,
        model: values.model,
      })
    })
    .catch((err) => {
      logger.error('[Write] Model call log write failed', {
        id,
        provider: values.provider,
        model: values.model,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      })
    })
}

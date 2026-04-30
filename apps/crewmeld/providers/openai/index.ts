import { createLogger } from '@crewmeld/logger'
import type { StreamingExecution } from '@/lib/types/execution'
import { getProviderDefaultModel, getProviderModels } from '@/providers/models'
import { providerProxyFetch } from '@/providers/provider-proxy'
import type { ProviderConfig, ProviderRequest, ProviderResponse } from '@/providers/types'
import { executeOpenAICompatibleRequest } from './compatible'
import { executeResponsesProviderRequest } from './core'

// ── Module logger ──────────────────────────────────────────────────────────────

const log = createLogger('OpenAIProvider')

// ── Provider metadata ─────────────────────────────────────────────────────────

/** Stable identifier for the OpenAI provider */
const OPENAI_PROVIDER_ID = 'openai' as const

/** Human-readable display name for the OpenAI provider */
const OPENAI_PROVIDER_LABEL = 'OpenAI'

/** Short description shown in provider listings */
const OPENAI_PROVIDER_DESCRIPTION = "OpenAI's GPT models"

/** Version string reported in the provider manifest */
const OPENAI_PROVIDER_VERSION = '1.0.0'

// ── Endpoint ───────────────────────────────────────────────────────────────────

/** URL of the OpenAI Responses API */
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'

// ── API key guard ──────────────────────────────────────────────────────────────

/** Error message emitted when an OpenAI request arrives without an API key */
const MISSING_API_KEY_MSG = 'API key is required for OpenAI'

/** Header name for the OpenAI beta flag */
const OPENAI_BETA_HEADER_KEY = 'OpenAI-Beta'

/** Value of the beta header that activates the Responses API */
const OPENAI_BETA_HEADER_VALUE = 'responses=v1'

/** Authorization header prefix */
const BEARER_PREFIX = 'Bearer'

// ── Provider definition ────────────────────────────────────────────────────────

/**
 * CrewMeld OpenAI provider.
 *
 * Routes requests through the Responses API by default.
 * When a caller supplies a custom `apiEndpoint`, the request is delegated to
 * `executeOpenAICompatibleRequest` (Chat Completions protocol) so that
 * third-party services like Alibaba DashScope, DeepSeek, and SiliconFlow
 * can reuse the same provider slot.
 */
export const openaiProvider: ProviderConfig = {
  id: OPENAI_PROVIDER_ID,
  name: OPENAI_PROVIDER_LABEL,
  description: OPENAI_PROVIDER_DESCRIPTION,
  version: OPENAI_PROVIDER_VERSION,
  models: getProviderModels('openai'),
  defaultModel: getProviderDefaultModel('openai'),

  executeRequest: async (
    request: ProviderRequest
  ): Promise<ProviderResponse | StreamingExecution> => {
    if (!request.apiKey) throw new Error(MISSING_API_KEY_MSG)

    const overrideEndpoint = (request as ProviderRequest & { apiEndpoint?: string }).apiEndpoint

    if (overrideEndpoint?.trim()) {
      return executeOpenAICompatibleRequest(request)
    }

    return executeResponsesProviderRequest(request, {
      providerId: OPENAI_PROVIDER_ID,
      providerLabel: OPENAI_PROVIDER_LABEL,
      modelName: request.model,
      endpoint: OPENAI_RESPONSES_URL,
      headers: {
        Authorization: `${BEARER_PREFIX} ${request.apiKey}`,
        'Content-Type': 'application/json',
        [OPENAI_BETA_HEADER_KEY]: OPENAI_BETA_HEADER_VALUE,
      },
      logger: log,
      fetch: providerProxyFetch,
    })
  },
}

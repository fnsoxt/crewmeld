import { createLogger } from '@crewmeld/logger'
import { GoogleGenAI } from '@google/genai'
import type { StreamingExecution } from '@/lib/types/execution'
import { executeGeminiRequest } from '@/providers/gemini/core'
import { getProviderDefaultModel, getProviderModels } from '@/providers/models'
import { providerProxyFetch } from '@/providers/provider-proxy'
import type { ProviderConfig, ProviderRequest, ProviderResponse } from '@/providers/types'

const log = createLogger('GoogleProvider')

// ── Provider metadata ─────────────────────────────────────────────────────────

/** Stable identifier for the Google Gemini provider */
const GOOGLE_PROVIDER_ID = 'google' as const

/** Human-readable display name for the Google Gemini provider */
const GOOGLE_PROVIDER_LABEL = 'Google'

/** Short description surfaced in provider listings */
const GOOGLE_PROVIDER_DESCRIPTION = "Google's Gemini models"

/** Log message emitted when a new GoogleGenAI client is allocated */
const CLIENT_ALLOC_LOG = 'Creating Google Gemini client'

/** Provider type tag forwarded to the Gemini execution core */
const GOOGLE_PROVIDER_TYPE = 'google' as const

/** Version string reported in the provider manifest */
const GOOGLE_PROVIDER_VERSION = '1.0.0'

// ── API key guard ─────────────────────────────────────────────────────────────

/** Error message emitted when a Google Gemini request arrives without an API key */
const MISSING_API_KEY_MSG = 'API key is required for Google Gemini'

/** Asserts that the request carries an API key, throwing if absent */
function assertApiKey(req: ProviderRequest): asserts req is ProviderRequest & { apiKey: string } {
  if (!req.apiKey) throw new Error(MISSING_API_KEY_MSG)
}

// ── Proxy injection ────────────────────────────────────────────────────────────

/**
 * The GoogleGenAI SDK does not expose a `fetch` constructor option, so we
 * patch the internal `apiClient.apiCall` method at runtime to route all
 * outbound HTTP through the shared CrewMeld proxy layer.
 *
 * The cast to `any` is intentional — `apiClient` is a private SDK field
 * with no public type signature.
 */
function injectProxyFetch(ai: GoogleGenAI): void {
  // biome-ignore lint/suspicious/noExplicitAny: SDK internal apiClient.apiCall is a runtime method
  ;(ai as any).apiClient.apiCall = (url: string, init: RequestInit) =>
    providerProxyFetch(url, init).catch((err: Error) => {
      throw new Error(`exception ${err} sending request`)
    })
}

// ── Client factory ─────────────────────────────────────────────────────────────

/**
 * Allocates a `GoogleGenAI` client authenticated with the given API key,
 * then patches it to use the CrewMeld proxy fetch.
 *
 * @param apiKey - The caller's Google Gemini API key
 * @returns A ready-to-use `GoogleGenAI` instance
 */
function buildGoogleClient(apiKey: string): GoogleGenAI {
  const ai = new GoogleGenAI({ apiKey })
  injectProxyFetch(ai)
  return ai
}

// ── Provider definition ────────────────────────────────────────────────────────

/**
 * CrewMeld Google Gemini provider.
 *
 * Authenticates via API key and delegates all execution logic to
 * `executeGeminiRequest` in gemini/core.ts. Shares the same core with the
 * Vertex AI provider — the only difference is how the client is constructed.
 */
export const googleProvider: ProviderConfig = {
  id: GOOGLE_PROVIDER_ID,
  name: GOOGLE_PROVIDER_LABEL,
  description: GOOGLE_PROVIDER_DESCRIPTION,
  version: GOOGLE_PROVIDER_VERSION,
  models: getProviderModels('google'),
  defaultModel: getProviderDefaultModel('google'),

  executeRequest: async (
    request: ProviderRequest
  ): Promise<ProviderResponse | StreamingExecution> => {
    assertApiKey(request)

    log.info(CLIENT_ALLOC_LOG, { model: request.model })

    const ai = buildGoogleClient(request.apiKey)

    return executeGeminiRequest({
      ai,
      model: request.model,
      request,
      providerType: GOOGLE_PROVIDER_TYPE,
    })
  },
}

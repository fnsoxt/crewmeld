import Anthropic from '@anthropic-ai/sdk'
import { createLogger } from '@crewmeld/logger'
import type { StreamingExecution } from '@/lib/types/execution'
import { executeAnthropicProviderRequest } from '@/providers/anthropic/core'
import { getProviderDefaultModel, getProviderModels } from '@/providers/models'
import { providerProxyFetch } from '@/providers/provider-proxy'
import type { ProviderConfig, ProviderRequest, ProviderResponse } from '@/providers/types'

const log = createLogger('AnthropicProvider')

// ── Beta feature flags ─────────────────────────────────────────────────────────

/** Anthropic beta header value that enables native structured output support */
const STRUCTURED_OUTPUTS_BETA_HEADER = 'structured-outputs-2025-11-13'

/** Header key used to declare beta feature participation */
const ANTHROPIC_BETA_HEADER_KEY = 'anthropic-beta'

// ── Header builders ────────────────────────────────────────────────────────────

/**
 * Builds the default-headers map for an Anthropic SDK client.
 * Returns an object with the beta header when structured outputs are enabled,
 * or an empty object otherwise.
 */
function buildDefaultHeaders(useNativeStructuredOutputs: boolean): Record<string, string> {
  if (!useNativeStructuredOutputs) return {}
  return { [ANTHROPIC_BETA_HEADER_KEY]: STRUCTURED_OUTPUTS_BETA_HEADER }
}

// ── Client constructor options ─────────────────────────────────────────────────

/** Parameters used to initialise one Anthropic SDK client instance */
interface ClientBootstrapParams {
  /** Anthropic API key for authentication */
  apiKey: string
  /** Whether to activate the structured-outputs beta header */
  useNativeStructuredOutputs: boolean
  /**
   * Optional base URL override — routes traffic to an Anthropic-compatible
   * endpoint (e.g. a local proxy) instead of the official Anthropic API.
   */
  endpointOverride?: string
}

// ── Client factory ─────────────────────────────────────────────────────────────

/**
 * Bootstraps an Anthropic SDK client from the supplied parameters.
 * Injects the shared `providerProxyFetch` so all outbound HTTP goes through
 * the CrewMeld proxy layer.
 */
function bootstrapAnthropicClient(params: ClientBootstrapParams): Anthropic {
  const { apiKey, useNativeStructuredOutputs, endpointOverride } = params
  return new Anthropic({
    apiKey,
    ...(endpointOverride ? { baseURL: endpointOverride } : {}),
    defaultHeaders: buildDefaultHeaders(useNativeStructuredOutputs),
    fetch: providerProxyFetch,
  })
}

// ── Endpoint resolution ────────────────────────────────────────────────────────

/** Extracts and trims the optional custom endpoint from a provider request */
function resolveEndpointOverride(
  req: ProviderRequest & { apiEndpoint?: string }
): string | undefined {
  const raw = req.apiEndpoint?.trim()
  return raw || undefined
}

// ── Provider definition ────────────────────────────────────────────────────────

/**
 * CrewMeld Anthropic provider.
 *
 * Executes requests against the Anthropic Claude API, delegating all
 * request logic to `executeAnthropicProviderRequest` in core.ts.
 *
 * A custom `apiEndpoint` on the request object routes traffic to
 * an Anthropic-compatible endpoint instead of the default API.
 */
export const anthropicProvider: ProviderConfig = {
  id: 'anthropic',
  name: 'Anthropic',
  description: "Anthropic's Claude models",
  version: '1.0.0',
  models: getProviderModels('anthropic'),
  defaultModel: getProviderDefaultModel('anthropic'),

  executeRequest: (request: ProviderRequest): Promise<ProviderResponse | StreamingExecution> => {
    const endpointOverride = resolveEndpointOverride(
      request as ProviderRequest & { apiEndpoint?: string }
    )

    return executeAnthropicProviderRequest(request, {
      providerId: 'anthropic',
      providerLabel: 'Anthropic',
      createClient: (apiKey, useNativeStructuredOutputs) =>
        bootstrapAnthropicClient({ apiKey, useNativeStructuredOutputs, endpointOverride }),
      logger: log,
    })
  },
}

/**
 * OpenAI-compatible mode executor — public entry point.
 *
 * When a custom API endpoint is configured in model settings (e.g. Alibaba DashScope /
 * DeepSeek / SiliconFlow and other OpenAI chat/completions compatible services), this
 * module uses the standard chat.completions protocol instead of OpenAI's Responses API.
 *
 * All execution logic lives in `compatible-engine.ts`; this file is intentionally thin
 * so the public export shape stays stable while the internals can evolve independently.
 *
 * Cost note: figures are derived from OpenAI pricing via calculateCost(); third-party
 * compatible endpoints will have inaccurate costs until per-provider tables are added.
 */
import type { StreamingExecution } from '@/lib/types/execution'
import type { ProviderRequest, ProviderResponse } from '@/providers/types'
import { CompatEngine } from './compatible-engine'

/**
 * Execute a request via the chat.completions protocol for OpenAI-compatible services.
 *
 * Validates the endpoint and API key, then delegates the full lifecycle
 * (message assembly, tool execution loop, streaming) to {@link CompatEngine}.
 */
export async function executeOpenAICompatibleRequest(
  request: ProviderRequest
): Promise<ProviderResponse | StreamingExecution> {
  return new CompatEngine(request).run()
}

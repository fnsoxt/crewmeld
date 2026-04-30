/**
 * @file DeepSeek provider adapter.
 *
 * Thin shim over {@link createOpenAICompatibleProvider} — all execution
 * logic (streaming, tool-call loop, retries, timing) lives in the shared
 * factory so this file stays minimal.
 */
import { createOpenAICompatibleProvider } from '@/providers/_openai-compat-factory'
import { getProviderDefaultModel, getProviderModels } from '@/providers/models'

// ─── Provider instance ────────────────────────────────────────────────────────

/**
 * DeepSeek chat-completion provider.
 * Uses the OpenAI-compatible DashScope endpoint at api.deepseek.com.
 */
export const deepseekProvider = createOpenAICompatibleProvider({
  id: 'deepseek',
  name: 'DeepSeek',
  description: "DeepSeek's chat models",
  defaultBaseURL: 'https://api.deepseek.com/v1',
  defaultModel: getProviderDefaultModel('deepseek'),
  models: getProviderModels('deepseek'),
  logPrefix: 'Deepseek',
  version: '1.0.0',
})

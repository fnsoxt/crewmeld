/**
 * @file Baidu ERNIE (文心一言) provider adapter.
 *
 * Thin shim over {@link createOpenAICompatibleProvider} — all execution
 * logic (streaming, tool-call loop, retries, timing) lives in the shared
 * factory so this file stays minimal.
 *
 * Error classification for Baidu-specific codes (110/111/336xxx) is handled
 * at the factory level via the generic error classifier.  Fine-grained
 * ERNIE error messages remain available in {@link ./utils} for UI use.
 */
import { createOpenAICompatibleProvider } from '@/providers/_openai-compat-factory'
import { getProviderDefaultModel, getProviderModels } from '@/providers/models'

// ─── Endpoint ─────────────────────────────────────────────────────────────────

/** Baidu Qianfan OpenAI-compatible gateway URL. */
const ERNIE_BASE_URL = 'https://qianfan.baidubce.com/v2'

// ─── Provider instance ────────────────────────────────────────────────────────

/**
 * Baidu ERNIE chat-completion provider.
 * Targets the Baidu Qianfan OpenAI-compatible gateway.
 */
export const ernieProvider = createOpenAICompatibleProvider({
  id: 'ernie',
  name: '百度',
  description: '百度文心一言大语言模型（ERNIE-4.0）',
  defaultBaseURL: ERNIE_BASE_URL,
  defaultModel: getProviderDefaultModel('ernie'),
  models: getProviderModels('ernie'),
  logPrefix: 'ERNIE',
  version: '1.0.0',
})

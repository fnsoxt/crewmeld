/**
 * @file Tencent Hunyuan (混元) provider adapter.
 *
 * Thin shim over {@link createOpenAICompatibleProvider} — all execution
 * logic (streaming, tool-call loop, retries, timing) lives in the shared
 * factory so this file stays minimal.
 *
 * Fine-grained Tencent error codes (AuthFailure, LimitExceeded, etc.) are
 * available in {@link ./utils} for UI display; the factory handles
 * quota / connectivity classification generically.
 */
import { createOpenAICompatibleProvider } from '@/providers/_openai-compat-factory'
import { getProviderDefaultModel, getProviderModels } from '@/providers/models'

// ─── Endpoint ─────────────────────────────────────────────────────────────────

/** Tencent Hunyuan OpenAI-compatible gateway URL. */
const HUNYUAN_BASE_URL = 'https://api.hunyuan.cloud.tencent.com/v1'

// ─── Provider instance ────────────────────────────────────────────────────────

/**
 * Tencent Hunyuan chat-completion provider.
 * Targets the Hunyuan OpenAI-compatible cloud gateway.
 */
export const hunyuanProvider = createOpenAICompatibleProvider({
  id: 'hunyuan',
  name: '腾讯',
  description: '腾讯混元大语言模型（Hunyuan-Turbo）',
  defaultBaseURL: HUNYUAN_BASE_URL,
  defaultModel: getProviderDefaultModel('hunyuan'),
  models: getProviderModels('hunyuan'),
  logPrefix: 'Hunyuan',
  version: '1.0.0',
})

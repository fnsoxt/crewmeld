/**
 * @file Alibaba Cloud Qwen (通义千问) provider adapter.
 *
 * Thin shim over {@link createOpenAICompatibleProvider} — all execution
 * logic (streaming, tool-call loop, retries, timing) lives in the shared
 * factory so this file stays minimal.
 */
import { createOpenAICompatibleProvider } from '@/providers/_openai-compat-factory'

// ─── Model catalogue ──────────────────────────────────────────────────────────

/** Supported Qwen model identifiers. */
const QWEN_MODELS = ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen-long'] as const

/** Default model used when none is specified. */
const QWEN_DEFAULT_MODEL = 'qwen-plus'

/** DashScope OpenAI-compatible endpoint. */
const QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

// ─── Provider instance ────────────────────────────────────────────────────────

/**
 * Alibaba Cloud Qwen chat-completion provider.
 * Targets the DashScope OpenAI-compatible endpoint.
 */
export const qwenProvider = createOpenAICompatibleProvider({
  id: 'qwen',
  name: '阿里云',
  description: '阿里云通义千问大语言模型（Qwen2.5）',
  defaultBaseURL: QWEN_BASE_URL,
  defaultModel: QWEN_DEFAULT_MODEL,
  models: [...QWEN_MODELS],
  logPrefix: 'Qwen',
  version: '1.0.0',
})

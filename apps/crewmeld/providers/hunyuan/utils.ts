import type { ChatCompletionChunk } from 'openai/resources/chat/completions'
import type { CompletionUsage } from 'openai/resources/completions'
import { createOpenAICompatibleStream } from '@/providers/utils'

// ─── Error code registry ──────────────────────────────────────────────────────

/**
 * Typed tuple of [errorCode, chineseMessage] pairs used to seed the registry.
 * Keeping data as tuples separates the shape from the lookup structure.
 */
type HunyuanErrorEntry = [code: string, message: string]

/** Raw error catalogue for Tencent Hunyuan. Each tuple is [API error code, localised text]. */
const HUNYUAN_ERROR_CATALOGUE: HunyuanErrorEntry[] = [
  // Authentication errors
  ['AuthFailure', 'API 认证失败，请检查 SecretId 和 SecretKey'],
  ['AuthFailure.SecretIdNotFound', 'SecretId 不存在，请检查配置'],
  ['AuthFailure.SignatureExpire', '签名已过期，请重试'],
  ['AuthFailure.SignatureFailure', '签名验证失败，请检查 SecretKey'],
  ['AuthFailure.UnauthorizedOperation', '无权限执行此操作'],
  // Operation failures
  ['FailedOperation.EngineRequestTimeout', '模型推理超时，请稍后重试'],
  ['FailedOperation.FreeResourcePackExhausted', '免费资源包已用尽，请开通付费'],
  ['FailedOperation.ResourcePackExhausted', '资源包已用尽，请续费或购买新资源包'],
  // Generic errors
  ['InternalError', '服务器内部错误，请稍后重试'],
  ['InvalidParameter', '参数错误，请检查请求参数'],
  ['InvalidParameterValue.Model', '模型不存在或未开通'],
  // Rate limits
  ['LimitExceeded', '请求频率超限，请降低请求频率'],
  ['RequestLimitExceeded', '请求频率超限，请稍后重试'],
  // Resource
  ['ResourceInsufficient', '余额不足，请充值后重试'],
  ['UnsupportedOperation', '不支持的操作'],
]

/** Fast lookup map seeded from the catalogue above. */
const HUNYUAN_ERROR_MAP = new Map<string, string>(HUNYUAN_ERROR_CATALOGUE)

/**
 * Tencent Hunyuan API error code → localised Chinese description.
 * Exported as a plain object for backwards-compatible indexed access.
 */
export const HUNYUAN_ERROR_MESSAGES: Record<string, string> = Object.fromEntries(HUNYUAN_ERROR_MAP)

// ─── Error classification ─────────────────────────────────────────────────────

/** Broad category buckets for Tencent Hunyuan error codes. */
export type HunyuanErrorCategory = 'auth' | 'quota' | 'resource' | 'model' | 'parameter' | 'service'

/**
 * Classifies a Tencent Hunyuan error code string into a {@link HunyuanErrorCategory}.
 *
 * @param errorCode - String code from the Hunyuan API response.
 */
export function classifyHunyuanError(errorCode: string): HunyuanErrorCategory {
  if (errorCode.startsWith('AuthFailure')) return 'auth'
  if (errorCode === 'LimitExceeded' || errorCode === 'RequestLimitExceeded') return 'quota'
  if (errorCode === 'ResourceInsufficient' || errorCode.includes('ResourcePack')) return 'resource'
  if (errorCode.includes('Model') || errorCode.includes('EngineRequest')) return 'model'
  if (errorCode === 'InvalidParameter' || errorCode.startsWith('InvalidParameterValue'))
    return 'parameter'
  return 'service'
}

// ─── Structured error builder ─────────────────────────────────────────────────

/** Structured representation of a resolved Tencent Hunyuan API error. */
export interface HunyuanApiError {
  /** Raw string code from the response body. */
  readonly code: string
  /** Localised Chinese user-facing message. */
  readonly localMessage: string
  /** Broad category bucket for UI routing. */
  readonly category: HunyuanErrorCategory
  /** Whether the error is retryable without user intervention. */
  readonly retryable: boolean
}

/**
 * Parses a raw Tencent Hunyuan error code into a structured {@link HunyuanApiError}.
 *
 * @param errorCode      - String code received from the API.
 * @param defaultMessage - Fallback message when the code is unregistered.
 */
export function parseHunyuanApiError(errorCode: string, defaultMessage: string): HunyuanApiError {
  const localMessage = getHunyuanErrorMessage(errorCode, defaultMessage)
  const category = classifyHunyuanError(errorCode)
  const retryable = category === 'service' || category === 'quota'
  return { code: errorCode, localMessage, category, retryable }
}

// ─── Registry introspection ───────────────────────────────────────────────────

/** Total number of registered Tencent Hunyuan error codes. */
export const HUNYUAN_ERROR_CODE_COUNT: number = HUNYUAN_ERROR_MAP.size

/** Retryable category labels — codes in these buckets are safe to replay. */
export const HUNYUAN_RETRYABLE_CATEGORIES: HunyuanErrorCategory[] = ['service', 'quota']

/**
 * Returns true when {@link errorCode} has a registered localised message.
 *
 * @param errorCode - String code to probe.
 */
export function isKnownHunyuanErrorCode(errorCode: string): boolean {
  return HUNYUAN_ERROR_MAP.has(errorCode)
}

/**
 * Returns all registered error codes in insertion order.
 * Intended for diagnostic tooling and test fixtures.
 */
export function listHunyuanErrorCodes(): string[] {
  return [...HUNYUAN_ERROR_MAP.keys()]
}

// ─── Error lookup ─────────────────────────────────────────────────────────────

/**
 * Resolves a Tencent Hunyuan error code to its localised description.
 * Falls back to {@link defaultMessage} when no entry is registered.
 *
 * @param errorCode      - String code from the Hunyuan API response body.
 * @param defaultMessage - Fallback text when the code is unrecognised.
 */
export function getHunyuanErrorMessage(errorCode: string, defaultMessage: string): string {
  return HUNYUAN_ERROR_MAP.get(errorCode) ?? defaultMessage
}

// ─── Streaming adapter ────────────────────────────────────────────────────────

/** Provider tag passed to the shared stream framing layer for log attribution. */
const HUNYUAN_PROVIDER_TAG = 'Hunyuan'

/**
 * Adapts a Tencent Hunyuan SSE chunk iterator into a {@link ReadableStream}.
 *
 * The Hunyuan OpenAI-compatible gateway emits the same wire format as
 * OpenAI, so the shared utility handles all framing and back-pressure.
 *
 * @param chunks     - Async chunk iterable from the OpenAI SDK.
 * @param onComplete - Optional callback fired after the stream drains, with
 *                     the assembled text and token-usage counters.
 */
export function createReadableStreamFromHunyuanStream(
  chunks: AsyncIterable<ChatCompletionChunk>,
  onComplete?: (content: string, usage: CompletionUsage) => void
): ReadableStream<Uint8Array> {
  const upstream = createOpenAICompatibleStream(chunks, HUNYUAN_PROVIDER_TAG, onComplete)
  return upstream
}

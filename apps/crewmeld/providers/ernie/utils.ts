import type { ChatCompletionChunk } from 'openai/resources/chat/completions'
import type { CompletionUsage } from 'openai/resources/completions'
import { createOpenAICompatibleStream } from '@/providers/utils'

// ─── Error code registry ──────────────────────────────────────────────────────

/**
 * Typed tuple of [errorCode, chineseMessage] pairs used to seed the registry.
 * Keeping the data as tuples separates the shape from the lookup structure.
 */
type ErnieErrorEntry = [code: number, message: string]

/** Raw error catalogue. Each tuple is [Baidu Qianfan numeric code, localised text]. */
const ERROR_CATALOGUE: ErnieErrorEntry[] = [
  // Service and quota faults
  [1, '服务器内部错误，请稍后重试'],
  [2, '服务暂不可用，请稍后重试'],
  [3, '调用的 API 不存在，请检查请求 URL'],
  [4, '集群超限额，请稍后重试'],
  [6, '无权限访问该接口，请检查 API Key 权限'],
  [13, '请求体超过限制'],
  [14, '访问频率超限，请降低请求频率'],
  [15, '应用不存在'],
  [17, '每日请求量超限'],
  [18, '每分钟请求量超限，请降低请求频率'],
  [19, '请求总量超限，请充值后重试'],
  // Parameter validation
  [100, '参数无效，请检查请求参数'],
  // Access token lifecycle
  [110, 'Access Token 无效或已过期，请重新获取'],
  [111, 'Access Token 已过期，请重新获取'],
  // Model-service layer
  [336000, '服务器内部错误，请稍后重试'],
  [336001, '请求参数错误，请检查入参'],
  [336002, '请求参数缺失'],
  [336003, '模型服务异常，请稍后重试'],
  [336100, '模型不存在或未开通'],
  [336101, '余额不足，请充值后重试'],
]

/** Fast lookup map seeded from the catalogue above. */
const ERROR_MAP = new Map<number, string>(ERROR_CATALOGUE)

/**
 * Baidu Qianfan numeric error code → localised Chinese description.
 * Exported as a plain object for backwards compatibility with callers that
 * do indexed access.  Seeded from {@link ERROR_MAP}.
 */
export const ERNIE_ERROR_MESSAGES: Record<number, string> = Object.fromEntries(ERROR_MAP)

// ─── Error classification ─────────────────────────────────────────────────────

/** Broad category buckets for Baidu Qianfan error codes. */
export type ErnieErrorCategory = 'auth' | 'quota' | 'model' | 'parameter' | 'service'

/**
 * Classifies a numeric Baidu Qianfan error code into a broad {@link ErnieErrorCategory}.
 * Useful for routing error responses to the correct UI handling path.
 *
 * @param errorCode - Raw numeric code from the API response.
 * @returns Category label for the given code.
 */
export function classifyErnieError(errorCode: number): ErnieErrorCategory {
  if (errorCode === 110 || errorCode === 111) return 'auth'
  if (errorCode === 14 || errorCode === 17 || errorCode === 18 || errorCode === 19) return 'quota'
  if (errorCode === 336100 || errorCode === 336003) return 'model'
  if (errorCode === 100 || errorCode === 336001 || errorCode === 336002) return 'parameter'
  return 'service'
}

// ─── Error lookup ─────────────────────────────────────────────────────────────

/**
 * Resolves a Baidu Qianfan error code to its localised description.
 * Falls back to {@link defaultMessage} when no entry is registered.
 *
 * @param errorCode      - Numeric code from the Qianfan API response body.
 * @param defaultMessage - Fallback text when the code is unrecognised.
 */
export function getErnieErrorMessage(errorCode: number, defaultMessage: string): string {
  return ERROR_MAP.get(errorCode) ?? defaultMessage
}

// ─── Structured error builder ─────────────────────────────────────────────────

/** Structured representation of a resolved Baidu Qianfan API error. */
export interface ErnieApiError {
  /** Raw numeric code from the response body. */
  readonly code: number
  /** Localised Chinese user-facing message. */
  readonly localMessage: string
  /** Broad category bucket for UI routing. */
  readonly category: ErnieErrorCategory
  /** Whether the error is retryable without user intervention. */
  readonly retryable: boolean
}

/**
 * Parses a raw Baidu Qianfan error code into a structured {@link ErnieApiError}.
 *
 * @param errorCode      - Numeric code received from the API.
 * @param defaultMessage - Fallback message when the code is unregistered.
 */
export function parseErnieApiError(errorCode: number, defaultMessage: string): ErnieApiError {
  const localMessage = getErnieErrorMessage(errorCode, defaultMessage)
  const category = classifyErnieError(errorCode)
  const retryable = category === 'service' || category === 'quota'
  return { code: errorCode, localMessage, category, retryable }
}

// ─── Registry introspection ───────────────────────────────────────────────────

/** Total number of registered Baidu Qianfan error codes. */
export const ERNIE_ERROR_CODE_COUNT: number = ERROR_MAP.size

/** Retryable category labels — codes in these buckets are safe to replay. */
export const ERNIE_RETRYABLE_CATEGORIES: ErnieErrorCategory[] = ['service', 'quota']

/**
 * Returns true when {@link errorCode} has a registered localised message.
 * Useful for conditional display logic — callers can skip the generic
 * fallback branch when this returns true.
 *
 * @param errorCode - Numeric code to probe.
 */
export function isKnownErnieErrorCode(errorCode: number): boolean {
  return ERROR_MAP.has(errorCode)
}

/**
 * Returns an array of all registered error codes in ascending order.
 * Intended for diagnostic tooling and test fixtures.
 */
export function listErnieErrorCodes(): number[] {
  return [...ERROR_MAP.keys()].sort((x, y) => x - y)
}

/**
 * Produces a diagnostic snapshot of every registered code together with its
 * localised message and category.  Intended for admin UIs and test fixtures.
 */
export function describeErnieErrorRegistry(): ErnieApiError[] {
  return listErnieErrorCodes().map((code) => parseErnieApiError(code, ''))
}

/**
 * Groups registered error entries by their {@link ErnieErrorCategory}.
 * Returns a `Map` keyed by category with arrays of matching codes.
 * Useful for building structured error-handling tables in documentation.
 */
export function groupErnieErrorsByCategory(): Map<ErnieErrorCategory, number[]> {
  const grouped = new Map<ErnieErrorCategory, number[]>()
  for (const code of listErnieErrorCodes()) {
    const bucket = classifyErnieError(code)
    const existing = grouped.get(bucket) ?? []
    existing.push(code)
    grouped.set(bucket, existing)
  }
  return grouped
}

// ─── Streaming adapter ────────────────────────────────────────────────────────

/** Provider tag passed to the shared stream framing layer for log attribution. */
const PROVIDER_TAG = 'ERNIE'

/**
 * Adapts a Baidu Qianfan SSE chunk iterator into a {@link ReadableStream}.
 *
 * The Qianfan OpenAI-compatible gateway emits the same wire format as
 * OpenAI, so the shared utility handles all framing and back-pressure.
 *
 * @param chunks     - Async chunk iterable from the OpenAI SDK.
 * @param onComplete - Optional callback fired after the stream drains, with
 *                     the assembled text and token-usage counters.
 */
export function createReadableStreamFromErnieStream(
  chunks: AsyncIterable<ChatCompletionChunk>,
  onComplete?: (content: string, usage: CompletionUsage) => void
): ReadableStream<Uint8Array> {
  const upstream = createOpenAICompatibleStream(chunks, PROVIDER_TAG, onComplete)
  return upstream
}

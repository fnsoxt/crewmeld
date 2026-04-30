import type { Logger } from '@crewmeld/logger'
import { createLogger } from '@crewmeld/logger'
import { getRedisClient } from '@/lib/core/config/redis'
import { getMaxExecutionTimeout } from '@/lib/core/execution-limits'
import { isUserFileWithMetadata } from '@/lib/core/utils/user-file'
import type { UserFile } from '@/lib/types/execution'
import { bufferToBase64 } from '@/lib/uploads/utils/file-utils'
import { downloadFileFromStorage, downloadFileFromUrl } from '@/lib/uploads/utils/file-utils.server'

// ─── constants ────────────────────────────────────────────────────────────────

const DEFAULT_MAX_BASE64_BYTES = 10 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = getMaxExecutionTimeout()
const DEFAULT_CACHE_TTL_SECONDS = 300
const REDIS_KEY_PREFIX = 'user-file:base64:'

// ─── option types ─────────────────────────────────────────────────────────────

export interface Base64HydrationOptions {
  requestId?: string
  executionId?: string
  logger?: Logger
  /** Maximum base64 payload size in bytes (default 10 MB). */
  maxBytes?: number
  /** When `true`, files with unknown size are still downloaded. */
  allowUnknownSize?: boolean
  timeoutMs?: number
  cacheTtlSeconds?: number
}

// ─── cache abstraction ────────────────────────────────────────────────────────

interface Base64Cache {
  get(file: UserFile): Promise<string | null>
  set(file: UserFile, value: string, ttlSeconds: number): Promise<void>
}

interface HydrationState {
  seen: WeakSet<object>
  cache: Base64Cache
  cacheTtlSeconds: number
}

// ─── cache key helpers ────────────────────────────────────────────────────────

function fileCacheKey(file: UserFile): string {
  if (file.key) return `key:${file.key}`
  if (file.url) return `url:${file.url}`
  return `id:${file.id}`
}

function redisKey(executionId: string | undefined, file: UserFile): string {
  const fk = fileCacheKey(file)
  return executionId ? `${REDIS_KEY_PREFIX}exec:${executionId}:${fk}` : `${REDIS_KEY_PREFIX}${fk}`
}

// ─── cache implementations ────────────────────────────────────────────────────

class InMemoryBase64Cache implements Base64Cache {
  private readonly store = new Map<string, { value: string; expiresAt: number }>()

  async get(file: UserFile): Promise<string | null> {
    const entry = this.store.get(fileCacheKey(file))
    if (!entry || entry.expiresAt <= Date.now()) {
      if (entry) this.store.delete(fileCacheKey(file))
      return null
    }
    return entry.value
  }

  async set(file: UserFile, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(fileCacheKey(file), { value, expiresAt: Date.now() + ttlSeconds * 1000 })
  }
}

function buildRedisCache(opts: Base64HydrationOptions, logger: Logger): Base64Cache {
  const redis = getRedisClient()
  const { executionId } = opts

  if (!redis) {
    logger.warn(`[${opts.requestId}] Redis unavailable for base64 cache — using in-memory fallback`)
    return new InMemoryBase64Cache()
  }

  return {
    async get(file) {
      try {
        return await redis.get(redisKey(executionId, file))
      } catch (err) {
        logger.warn(`[${opts.requestId}] Redis get failed, skipping cache`, err)
        return null
      }
    },
    async set(file, value, ttlSeconds) {
      try {
        await redis.set(redisKey(executionId, file), value, 'EX', ttlSeconds)
      } catch (err) {
        logger.warn(`[${opts.requestId}] Redis set failed, skipping cache`, err)
      }
    },
  }
}

function buildHydrationState(opts: Base64HydrationOptions, logger: Logger): HydrationState {
  return {
    seen: new WeakSet<object>(),
    cache: buildRedisCache(opts, logger),
    cacheTtlSeconds: opts.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS,
  }
}

function resolveLogger(opts: Base64HydrationOptions): Logger {
  return opts.logger ?? createLogger('UserFileBase64')
}

// ─── base64 resolution ────────────────────────────────────────────────────────

async function fetchBase64ForFile(
  file: UserFile,
  opts: Base64HydrationOptions,
  logger: Logger
): Promise<string | null> {
  if (file.base64) return file.base64

  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BASE64_BYTES
  const allowUnknownSize = opts.allowUnknownSize ?? false
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const requestId = opts.requestId ?? 'unknown'

  if (Number.isFinite(file.size) && file.size > maxBytes) {
    logger.warn(`[${requestId}] Skipping base64 for ${file.name} (size ${file.size} > ${maxBytes})`)
    return null
  }

  const sizeUnknown = !Number.isFinite(file.size) || file.size <= 0
  if (sizeUnknown && !allowUnknownSize && !file.key) {
    logger.warn(`[${requestId}] Skipping base64 for ${file.name} (unknown size)`)
    return null
  }

  let buffer: Buffer | null = null

  if (file.key) {
    try {
      buffer = await downloadFileFromStorage(file, requestId, logger)
    } catch (err) {
      logger.warn(
        `[${requestId}] Storage download failed for ${file.name}, trying URL fallback`,
        err
      )
    }
  }

  if (!buffer && file.url) {
    try {
      buffer = await downloadFileFromUrl(file.url, timeoutMs)
    } catch (err) {
      logger.warn(`[${requestId}] URL download failed for ${file.name}`, err)
    }
  }

  if (!buffer) return null

  if (buffer.length > maxBytes) {
    logger.warn(
      `[${requestId}] Skipping base64 for ${file.name} (downloaded ${buffer.length} > ${maxBytes})`
    )
    return null
  }

  return bufferToBase64(buffer)
}

// ─── hydration logic ──────────────────────────────────────────────────────────

async function hydrateOneFile(
  file: UserFile,
  opts: Base64HydrationOptions,
  state: HydrationState,
  logger: Logger
): Promise<UserFile> {
  const cached = await state.cache.get(file)
  if (cached) return { ...file, base64: cached }

  const base64 = await fetchBase64ForFile(file, opts, logger)
  if (!base64) return file

  await state.cache.set(file, base64, state.cacheTtlSeconds)
  return { ...file, base64 }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

async function hydrateValue(
  value: unknown,
  opts: Base64HydrationOptions,
  state: HydrationState,
  logger: Logger
): Promise<unknown> {
  if (!value || typeof value !== 'object') return value

  if (isUserFileWithMetadata(value)) {
    return hydrateOneFile(value, opts, state, logger)
  }

  if (state.seen.has(value)) return value
  state.seen.add(value)

  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => hydrateValue(item, opts, state, logger)))
  }

  const pairs = await Promise.all(
    Object.entries(value).map(async ([k, v]) => [k, await hydrateValue(v, opts, state, logger)])
  )

  return Object.fromEntries(pairs)
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Recursively traverse `value` and hydrate any embedded `UserFile` objects
 * with `base64` content fetched from storage.
 *
 * Returns the original structure with `UserFile.base64` populated where
 * retrieval succeeded.
 */
export async function hydrateUserFilesWithBase64(
  value: unknown,
  opts: Base64HydrationOptions
): Promise<unknown> {
  const logger = resolveLogger(opts)
  const state = buildHydrationState(opts, logger)
  return hydrateValue(value, opts, state, logger)
}

/**
 * Return `true` when `value` (or any nested property) is a `UserFile` with
 * associated metadata (i.e. has a key or URL).
 */
export function containsUserFileWithMetadata(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  if (isUserFileWithMetadata(value)) return true

  if (Array.isArray(value)) {
    return value.some(containsUserFileWithMetadata)
  }

  if (!isPlainObject(value)) return false

  return Object.values(value).some(containsUserFileWithMetadata)
}

/**
 * Delete all Redis cache entries for a completed execution.
 * Safe to call even when Redis is unavailable (no-op).
 */
export async function cleanupExecutionBase64Cache(executionId: string): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return

  const pattern = `${REDIS_KEY_PREFIX}exec:${executionId}:*`
  const logger = createLogger('UserFileBase64')

  try {
    let cursor = '0'
    let deletedCount = 0

    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
      cursor = next
      if (keys.length > 0) {
        await redis.del(...keys)
        deletedCount += keys.length
      }
    } while (cursor !== '0')

    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} base64 cache entries for execution ${executionId}`)
    }
  } catch (error) {
    logger.warn(`Failed to cleanup base64 cache for execution ${executionId}`, error)
  }
}

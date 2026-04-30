import { createLogger } from '@crewmeld/logger'
import { getRedisClient } from '@/lib/core/config/redis'
import { getStorageMethod, type StorageMethod } from '@/lib/core/storage'
import type { RateLimitStorageAdapter } from './adapter'
import { RedisTokenBucket } from './redis-token-bucket'

const logger = createLogger('RateLimitStorage')

let cachedAdapter: RateLimitStorageAdapter | null = null

export function createStorageAdapter(): RateLimitStorageAdapter {
  if (cachedAdapter) {
    return cachedAdapter
  }

  const redis = getRedisClient()
  if (!redis) {
    throw new Error('Rate limiter requires Redis; configure REDIS_URL')
  }
  logger.info('Rate limiting: Using Redis')
  cachedAdapter = new RedisTokenBucket(redis)

  return cachedAdapter
}

export function getAdapterType(): StorageMethod {
  return getStorageMethod()
}

export function resetStorageAdapter(): void {
  cachedAdapter = null
}

export function setStorageAdapter(adapter: RateLimitStorageAdapter): void {
  cachedAdapter = adapter
}

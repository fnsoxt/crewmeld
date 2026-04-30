/**
 * Message deduplication - Redis SETNX + TTL, falls back to in-memory LRU when Redis is unavailable
 *
 * When Redis is available, uses Redis persistent dedup; dedup works correctly even after service restart.
 * When Redis is unavailable, falls back to in-memory Map (single-replica deployments only).
 */

import type { ConversationChannel } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { getRedisClient } from '@/lib/core/config/redis'

const logger = createLogger('ChannelDedup')

/** Dedup TTL: 5 minutes */
const DEDUP_TTL_SECONDS = 5 * 60

/**
 * In-memory dedup cache (fallback when Redis is unavailable)
 * Uses Map to maintain insertion order, evicts oldest entries when threshold is exceeded
 */
const memoryCache = new Map<string, number>()
const MAX_CACHE_SIZE = 10000

function buildKey(channel: ConversationChannel, messageId: string): string {
  return `dedup:${channel}:${messageId}`
}

/**
 * Check if a message is a duplicate
 *
 * @returns `true` if the message has been processed before (duplicate) and should be discarded
 */
export async function isMessageDuplicate(
  channel: ConversationChannel,
  messageId: string
): Promise<boolean> {
  const key = buildKey(channel, messageId)

  // Prefer Redis
  const redis = getRedisClient()
  if (redis) {
    return redisDeduplicate(key, channel, messageId)
  }

  // Fallback: in-memory dedup
  return memoryDeduplicate(key, channel, messageId)
}

/**
 * Redis dedup: SETNX + TTL, atomic operation
 */
async function redisDeduplicate(
  key: string,
  channel: ConversationChannel,
  messageId: string
): Promise<boolean> {
  try {
    const redis = getRedisClient()!
    // SET key 1 NX EX ttl - only set when key doesn't exist, with TTL
    const result = await redis.set(key, '1', 'EX', DEDUP_TTL_SECONDS, 'NX')
    if (result !== 'OK') {
      // Key already exists -> duplicate message
      logger.info(`Message deduplicated (Redis): channel=${channel}, messageId=${messageId}`)
      return true
    }
    return false
  } catch (err) {
    logger.warn('Redis dedup failed, falling back to in-memory dedup', {
      error: (err as Error).message,
    })
    return memoryDeduplicate(key, channel, messageId)
  }
}

/**
 * In-memory dedup (fallback)
 */
function memoryDeduplicate(key: string, channel: ConversationChannel, messageId: string): boolean {
  const now = Date.now()
  const ttlMs = DEDUP_TTL_SECONDS * 1000

  // Clean up expired entries
  for (const [k, timestamp] of memoryCache) {
    if (now - timestamp > ttlMs) {
      memoryCache.delete(k)
    } else {
      break
    }
  }

  // Check if exists
  if (memoryCache.has(key)) {
    logger.info(`Message deduplicated (memory): channel=${channel}, messageId=${messageId}`)
    return true
  }

  // Evict oldest entry
  if (memoryCache.size >= MAX_CACHE_SIZE) {
    const firstKey = memoryCache.keys().next().value
    if (firstKey) memoryCache.delete(firstKey)
  }

  memoryCache.set(key, now)
  return false
}

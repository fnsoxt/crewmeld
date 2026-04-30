/**
 * WeCom card response_code cache
 *
 * Stores response_code when sending approval cards, retrieves it during approval callbacks to update cards.
 * Uses in-memory cache + 24-hour expiration (matching approval token expiration).
 */

const cache = new Map<string, { responseCode: string; expiresAt: number }>()

const TTL_MS = 24 * 60 * 60 * 1000

/**
 * Store pauseId -> response_code mapping
 */
export function storeCardResponseCode(pauseId: string, responseCode: string): void {
  cache.set(pauseId, { responseCode, expiresAt: Date.now() + TTL_MS })
}

/**
 * Get and delete response_code (one-time use)
 */
export function getCardResponseCode(pauseId: string): string | null {
  const entry = cache.get(pauseId)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(pauseId)
    return null
  }
  cache.delete(pauseId)
  return entry.responseCode
}

/**
 * Temporary file in-memory cache — for generating short-lived download links
 *
 * Files are stored in memory and auto-expire after 10 minutes.
 * Used for sharing SOP execution result files via IM channels (DingTalk link messages, etc.).
 */

import { randomUUID } from 'crypto'

interface TempFile {
  name: string
  mimeType: string
  base64: string
  expiresAt: number
}

const store = new Map<string, TempFile>()

/** Default TTL: 10 minutes */
const DEFAULT_TTL_MS = 10 * 60 * 1000

/**
 * Store a temporary file, return token
 */
export function storeTempFile(
  file: { name: string; mimeType: string; base64: string },
  ttlMs = DEFAULT_TTL_MS
): string {
  const token = randomUUID()
  store.set(token, {
    ...file,
    expiresAt: Date.now() + ttlMs,
  })

  // Scheduled cleanup
  setTimeout(() => {
    store.delete(token)
  }, ttlMs + 1000)

  return token
}

/**
 * Get a temporary file (returns null if expired)
 */
export function getTempFile(token: string): TempFile | null {
  const file = store.get(token)
  if (!file) return null

  if (Date.now() > file.expiresAt) {
    store.delete(token)
    return null
  }

  return file
}

/**
 * Generate temporary file download URL
 */
export function buildTempFileUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:6100'
  return `${baseUrl}/api/files/temp/${token}`
}

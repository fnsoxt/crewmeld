/**
 * API key auth stub — P0 does not ship programmatic API key encryption/auth.
 * Plaintext comparison is used as a safe minimum.
 *
 * TODO: P1 port real implementation from upstream engine (lib/api-key/auth.ts).
 */

export function isEncryptedKey(_storedKey: string): boolean {
  return false
}

export async function authenticateApiKey(inputKey: string, storedKey: string): Promise<boolean> {
  return inputKey === storedKey
}

export async function encryptApiKeyForStorage(apiKey: string): Promise<string> {
  return apiKey
}

export async function decryptApiKeyFromStorage(encryptedKey: string): Promise<string> {
  return encryptedKey
}

export async function createApiKey(_useStorage = true): Promise<{
  apiKey: string
  storedKey: string
}> {
  const apiKey = `cm_stub_${Date.now()}`
  return { apiKey, storedKey: apiKey }
}

export function getApiKeyLast4(apiKey: string): string {
  return apiKey.slice(-4)
}

export async function getApiKeyDisplayFormat(encryptedKey: string): Promise<string> {
  return formatApiKeyForDisplay(encryptedKey)
}

export function formatApiKeyForDisplay(apiKey: string): string {
  return `***${apiKey.slice(-4)}`
}

export async function getEncryptedApiKeyLast4(encryptedKey: string): Promise<string> {
  return encryptedKey.slice(-4)
}

export function isValidApiKeyFormat(apiKey: string): boolean {
  return typeof apiKey === 'string' && apiKey.length > 0
}

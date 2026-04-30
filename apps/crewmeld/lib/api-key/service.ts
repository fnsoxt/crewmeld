/**
 * API key service stub — the upstream engine ships a full personal + workspace API key
 * service; P0 defers to P1. Every header presented in hybrid auth is rejected
 * so routes fall back to session auth only.
 *
 * TODO: P1 port real implementation from upstream engine.
 */

export interface ApiKeyAuthResult {
  success: boolean
  userId?: string
  keyId?: string
  keyType?: 'personal' | 'workspace'
  error?: string
}

export async function authenticateApiKeyFromHeader(_header: string): Promise<ApiKeyAuthResult> {
  return { success: false, error: 'API key auth not available in P0' }
}

export async function updateApiKeyLastUsed(_keyId: string): Promise<void> {
  // no-op
}

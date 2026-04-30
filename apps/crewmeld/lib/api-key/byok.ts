/**
 * BYOK (Bring Your Own Key) stub — P0 does not ship the multi-tenant BYOK
 * pipeline. Returns no-op values so provider registry falls back to env vars.
 *
 * TODO: P1 port real implementation from upstream engine (lib/api-key/byok.ts).
 */

export type BYOKProviderId = 'openai' | 'anthropic' | 'google' | 'mistral'

export interface BYOKKeyResult {
  key: string | null
  source: 'user' | 'workspace' | 'env' | 'none'
}

export async function getBYOKKey(_provider: BYOKProviderId): Promise<BYOKKeyResult> {
  return { key: null, source: 'none' }
}

export interface ApiKeyWithBYOKResult {
  apiKey: string | null
  isBYOK?: boolean
}

export async function getApiKeyWithBYOK(
  _provider: BYOKProviderId | string,
  _model?: string,
  _workspaceId?: string,
  _fallbackKey?: string | null
): Promise<ApiKeyWithBYOKResult> {
  return { apiKey: _fallbackKey ?? null, isBYOK: false }
}

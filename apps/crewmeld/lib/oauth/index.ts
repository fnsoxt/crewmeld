/**
 * OAuth module stub — P0 ships without the full OAuth provider config /
 * scope-coverage pipeline. Only minimal types and no-op helpers are exposed so
 * call sites (hooks, API routes, tools) type-check and fail safe at runtime.
 *
 * TODO: P1 port real implementation from upstream engine (lib/oauth/{oauth,types,utils,microsoft}.ts).
 */

export * from './microsoft'
export * from './types'

import type { OAuthProvider, OAuthServiceConfig, ProviderConfig, ScopeEvaluation } from './types'

export interface OAuthProviderEntry {
  services: Record<string, OAuthServiceConfig>
  [key: string]: unknown
}

export const OAUTH_PROVIDERS: Record<string, OAuthProviderEntry> = {}

export interface OAuthTokenResult {
  accessToken: string
  expiresIn: number
  refreshToken?: string
}

export async function refreshOAuthToken(
  _providerOrCredentialId: string,
  _refreshToken?: string
): Promise<OAuthTokenResult | null> {
  return null
}

export function evaluateScopeCoverage(
  _providerId: OAuthProvider,
  _grantedScopes: string[]
): ScopeEvaluation {
  return {
    canonicalScopes: [],
    grantedScopes: [],
    missingScopes: [],
    extraScopes: [],
    requiresReauthorization: false,
  }
}

export function parseProvider(provider: OAuthProvider): ProviderConfig {
  const [baseProvider = String(provider), featureType = ''] = String(provider).split('-')
  return { baseProvider, featureType }
}

export function getAllOAuthServices(): unknown[] {
  return []
}

export function getProviderIdFromServiceId(serviceId: string): string {
  return serviceId
}

export function getServiceConfigByProviderId(_providerId: string): null {
  return null
}

export function getCanonicalScopesForProvider(_providerId: string): string[] {
  return []
}

export function normalizeScopes(scopes: string[]): string[] {
  return scopes
}

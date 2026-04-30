/**
 * Microsoft OAuth helpers stub — P0 does not ship the Microsoft OAuth token
 * refresh pipeline. Returns no-op values so code paths referencing Microsoft
 * accounts (better-auth callbacks) do not crash.
 *
 * TODO: P1 port real implementation from upstream engine.
 */

export const MICROSOFT_REFRESH_TOKEN_LIFETIME_DAYS = 90
export const PROACTIVE_REFRESH_THRESHOLD_DAYS = 7

export const MICROSOFT_PROVIDERS: Set<string> = new Set([
  'microsoft',
  'microsoft-excel',
  'microsoft-planner',
  'microsoft-teams',
  'outlook',
  'onedrive',
  'sharepoint',
])

export function isMicrosoftProvider(providerId: string): boolean {
  return MICROSOFT_PROVIDERS.has(providerId)
}

export function getMicrosoftRefreshTokenExpiry(): Date {
  return new Date(Date.now() + MICROSOFT_REFRESH_TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000)
}

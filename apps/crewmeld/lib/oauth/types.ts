/**
 * OAuth type definitions — P0 copy of upstream engine `lib/oauth/types.ts` (no
 * component deps). P1 will re-sync with upstream when real OAuth ships.
 */

export type OAuthProvider =
  | 'google'
  | 'google-email'
  | 'google-drive'
  | 'google-docs'
  | 'google-sheets'
  | 'google-calendar'
  | 'google-vault'
  | 'google-forms'
  | 'google-groups'
  | 'vertex-ai'
  | 'github'
  | 'github-repo'
  | 'x'
  | 'confluence'
  | 'airtable'
  | 'notion'
  | 'jira'
  | 'dropbox'
  | 'microsoft'
  | 'microsoft-excel'
  | 'microsoft-planner'
  | 'microsoft-teams'
  | 'outlook'
  | 'onedrive'
  | 'sharepoint'
  | 'linear'
  | 'slack'
  | 'reddit'
  | 'trello'
  | 'wealthbox'
  | 'webflow'
  | 'asana'
  | 'pipedrive'
  | 'hubspot'
  | 'salesforce'
  | 'linkedin'
  | 'shopify'
  | 'zoom'
  | 'wordpress'
  | 'spotify'
  | 'calcom'

export type OAuthService = OAuthProvider

export interface OAuthServiceConfig {
  name: string
  description: string
  providerId: string
  scopes: string[]
}

export interface OAuthServiceMetadata {
  providerId: string
  name: string
  description: string
  baseProvider: string
}

export interface ScopeEvaluation {
  canonicalScopes: string[]
  grantedScopes: string[]
  missingScopes: string[]
  extraScopes: string[]
  requiresReauthorization: boolean
}

export interface Credential {
  id: string
  name: string
  provider: OAuthProvider
  serviceId?: string
  lastUsed?: string
  isDefault?: boolean
  scopes?: string[]
  canonicalScopes?: string[]
  missingScopes?: string[]
  extraScopes?: string[]
  requiresReauthorization?: boolean
}

export interface ProviderConfig {
  baseProvider: string
  featureType: string
}

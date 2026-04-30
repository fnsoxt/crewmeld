/**
 * License types stub — P0 ships without licensing. These types exist so
 * code paths referencing license features remain type-safe.
 *
 * TODO: P1 port real implementation from upstream engine.
 */

export type LicenseFeature =
  | 'rbac'
  | 'audit'
  | 'multiTenant'
  | 'advancedAnalytics'
  | 'knowledge_base'
  | 'multi_model'
  | 'api_access'
  | 'sop_engine'
  | 'channel_integration'
  | 'private_deploy'
  | 'role_permission'
  | 'data_export'

/** License status object returned by the license API. */
export interface LicenseStatus {
  status: 'active' | 'expiring_soon' | 'expired' | 'invalid_signature' | 'community'
  edition: 'community' | 'standard' | 'enterprise'
  valid?: boolean
  customerName?: string
  currentEmployees?: number
  maxEmployees?: number
  expiresAt?: string | null
  daysRemaining?: number | null
  features?: LicenseFeature[]
  errorMessage?: string | null
}

export interface LicenseQuotaCheck {
  allowed: boolean
  reason: string | null
  reasonParams?: Record<string, number | string>
  currentCount: number
  maxCount: number
}

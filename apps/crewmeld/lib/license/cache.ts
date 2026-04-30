/**
 * License cache stub — P0 unconditionally reports a valid "community" license
 * with no quota cap. P1 will port the real license loader + cache.
 *
 * TODO: P1 port real implementation from upstream engine.
 */

import type { LicenseFeature, LicenseStatus } from './types'

export interface LicenseState {
  valid: boolean
  status: LicenseStatus
  maxEmployees: number
  features: LicenseFeature[]
  errorMessage: string | null
}

const COMMUNITY_FEATURES: LicenseFeature[] = [
  'knowledge_base',
  'multi_model',
  'api_access',
  'sop_engine',
  'channel_integration',
  'private_deploy',
]

export function getLicenseStatus(currentCount: number): LicenseState {
  const status: LicenseStatus = {
    status: 'community',
    edition: 'community',
    valid: true,
    currentEmployees: currentCount,
    maxEmployees: -1,
    expiresAt: null,
    daysRemaining: null,
    features: COMMUNITY_FEATURES,
    errorMessage: null,
  }
  return {
    valid: true,
    status,
    maxEmployees: -1,
    features: COMMUNITY_FEATURES,
    errorMessage: null,
  }
}

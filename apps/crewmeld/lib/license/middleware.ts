/**
 * License middleware stub for P0 — the P0 build ships without a licensing
 * layer; every quota check and feature check resolves to "allowed". P1 will
 * port the real license enforcement from upstream engine.
 *
 * TODO: P1 port real implementation from upstream engine.
 */

import { db } from '@crewmeld/db'
import { digitalEmployees } from '@crewmeld/db/schema'
import { count } from 'drizzle-orm'
import type { LicenseFeature, LicenseQuotaCheck } from './types'

export async function checkEmployeeQuota(): Promise<LicenseQuotaCheck> {
  const [result] = await db.select({ count: count() }).from(digitalEmployees)
  const currentCount = result?.count ?? 0
  return {
    allowed: true,
    reason: null,
    currentCount,
    maxCount: -1,
  }
}

export async function checkFeatureAccess(_feature: LicenseFeature): Promise<boolean> {
  return true
}

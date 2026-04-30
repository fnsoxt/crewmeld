import { db } from '@crewmeld/db'
import { platformSettings } from '@crewmeld/db/schema'
import { eq } from 'drizzle-orm'

interface RegistrationSettings {
  registrationDisabled: boolean
  approvalRequired: boolean
  allowedEmails: string
  allowedDomains: string
}

/** Get a single setting value from the platform_settings table */
export async function getPlatformSetting(key: string): Promise<unknown> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .limit(1)
  return row?.value ?? null
}

/** Get registration-related settings from the platform_settings table */
export async function getRegistrationSettings(): Promise<RegistrationSettings> {
  const rows = await db
    .select({ key: platformSettings.key, value: platformSettings.value })
    .from(platformSettings)

  const map = new Map<string, unknown>()
  for (const row of rows) {
    map.set(row.key, row.value)
  }

  return {
    registrationDisabled: Boolean(map.get('registration_disabled')),
    approvalRequired: Boolean(map.get('registration_approval_required')),
    allowedEmails: String(map.get('allowed_login_emails') ?? ''),
    allowedDomains: String(map.get('allowed_login_domains') ?? ''),
  }
}

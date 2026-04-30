import { db } from '@crewmeld/db'
import { platformSettings } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'

export const dynamic = 'force-dynamic'

const logger = createLogger('RegistrationSettingsAPI')

const REGISTRATION_KEYS = [
  'registration_disabled',
  'registration_approval_required',
  'allowed_login_emails',
  'allowed_login_domains',
] as const

type RegistrationKey = (typeof REGISTRATION_KEYS)[number]

interface RegistrationSettings {
  registrationDisabled: boolean
  approvalRequired: boolean
  allowedEmails: string
  allowedDomains: string
}

const KEY_TO_FIELD: Record<RegistrationKey, keyof RegistrationSettings> = {
  registration_disabled: 'registrationDisabled',
  registration_approval_required: 'approvalRequired',
  allowed_login_emails: 'allowedEmails',
  allowed_login_domains: 'allowedDomains',
}

/** GET /api/employee/settings/registration -- Return all registration settings */
export async function GET() {
  try {
    const authResult = await requirePermission('registration:view')
    if (!authResult.authenticated || authResult.error) {
      return apiAuthErr(authResult)
    }

    const rows = await db
      .select({ key: platformSettings.key, value: platformSettings.value })
      .from(platformSettings)

    const settingsMap = new Map<string, unknown>()
    for (const row of rows) {
      settingsMap.set(row.key, row.value)
    }

    const settings: RegistrationSettings = {
      registrationDisabled: Boolean(settingsMap.get('registration_disabled')),
      approvalRequired: Boolean(settingsMap.get('registration_approval_required')),
      allowedEmails: String(settingsMap.get('allowed_login_emails') ?? ''),
      allowedDomains: String(settingsMap.get('allowed_login_domains') ?? ''),
    }

    return apiOk(settings)
  } catch (error) {
    logger.error('Failed to fetch registration settings', error)
    return apiErr('api.setting.fetchRegistrationFailed', { status: 500 })
  }
}

/** PATCH /api/employee/settings/registration -- Update registration settings */
async function _PATCH(request: NextRequest) {
  try {
    const authResult = await requirePermission('registration:edit')
    if (!authResult.authenticated || authResult.error) {
      return apiAuthErr(authResult)
    }

    const body = await request.json()

    const updates: Array<{ key: RegistrationKey; value: unknown }> = []

    if ('registrationDisabled' in body) {
      updates.push({ key: 'registration_disabled', value: Boolean(body.registrationDisabled) })
    }
    if ('approvalRequired' in body) {
      updates.push({ key: 'registration_approval_required', value: Boolean(body.approvalRequired) })
    }
    if ('allowedEmails' in body) {
      updates.push({ key: 'allowed_login_emails', value: String(body.allowedEmails ?? '') })
    }
    if ('allowedDomains' in body) {
      updates.push({ key: 'allowed_login_domains', value: String(body.allowedDomains ?? '') })
    }

    if (updates.length === 0) {
      return apiErr('api.setting.noValidFields', { status: 400 })
    }

    for (const { key, value } of updates) {
      await db
        .insert(platformSettings)
        .values({
          key,
          value,
          updatedAt: new Date(),
          updatedBy: authResult.userId ?? null,
        })
        .onConflictDoUpdate({
          target: platformSettings.key,
          set: {
            value,
            updatedAt: new Date(),
            updatedBy: authResult.userId ?? null,
          },
        })
    }

    logger.info('Registration settings updated', {
      updates: updates.map((u) => u.key),
      updatedBy: authResult.userId,
    })

    return apiOk(null)
  } catch (error) {
    logger.error('Failed to update registration settings', error)
    return apiErr('api.setting.updateRegistrationFailed', { status: 500 })
  }
}

export const PATCH = withAudit(_PATCH)

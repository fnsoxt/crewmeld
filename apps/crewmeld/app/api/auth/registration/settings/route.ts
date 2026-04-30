import { db } from '@crewmeld/db'
import { platformSettings } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const logger = createLogger('RegistrationPublicAPI')

/** GET /api/auth/registration/settings — Public endpoint, returns registration/login toggle states */
export async function GET() {
  try {
    const rows = await db
      .select({ key: platformSettings.key, value: platformSettings.value })
      .from(platformSettings)

    const settingsMap = new Map<string, unknown>()
    for (const row of rows) {
      settingsMap.set(row.key, row.value)
    }

    return NextResponse.json({
      registrationDisabled: Boolean(settingsMap.get('registration_disabled')),
      approvalRequired: Boolean(settingsMap.get('registration_approval_required')),
    })
  } catch (error) {
    logger.error('Failed to fetch registration settings', error)
    return NextResponse.json(
      { registrationDisabled: false, approvalRequired: false },
      { status: 500 }
    )
  }
}

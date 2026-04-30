import { createLogger } from '@crewmeld/logger'
import { apiErr, apiOk } from '@/lib/api/response'
import { getSession } from '@/lib/auth'
import { getContactAvailability } from '@/lib/human-employees/contact-availability'

const logger = createLogger('API:HumanEmployees:ContactAvailability')

/**
 * GET /api/employee/human-employees/contact-availability — Channel availability status
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return apiErr('api.common.unauthorized', { status: 401 })
    }

    const availability = await getContactAvailability()

    return apiOk(availability)
  } catch (error) {
    logger.error('Failed to fetch channel availability', error)
    return apiErr('api.humanEmployee.fetchAvailabilityFailed', { status: 500 })
  }
}

import {
  CONTACT_METHOD_TYPES,
  CONTACT_TO_CONNECTION_TYPE,
  type ContactMethodType,
} from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { resolveSystemDefault } from '@/lib/connectors/resolver'
import type { ConnectionType } from '@/lib/connectors/types'

const logger = createLogger('ContactAvailability')

interface ChannelAvailability {
  contactType: ContactMethodType
  connectionType: string
  available: boolean
  connectionName: string | null
}

/**
 * Iterate CONTACT_METHOD_TYPES, query corresponding channel availability in system_connections
 */
export async function getContactAvailability(): Promise<ChannelAvailability[]> {
  const results: ChannelAvailability[] = []

  for (const contactType of CONTACT_METHOD_TYPES) {
    const connectionType = CONTACT_TO_CONNECTION_TYPE[contactType]
    try {
      const credential = await resolveSystemDefault(connectionType as ConnectionType)
      results.push({
        contactType,
        connectionType,
        available: credential !== null,
        connectionName: credential?.connectionName ?? null,
      })
    } catch (error) {
      logger.warn('Channel availability check failed', { contactType, error })
      results.push({
        contactType,
        connectionType,
        available: false,
        connectionName: null,
      })
    }
  }

  return results
}

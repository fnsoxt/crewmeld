import { db } from '@crewmeld/db'
import { systemConnections } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import { decryptConfig } from './encryption'

const logger = createLogger('ResolveConnEnv')

/**
 * Convert camelCase config key to CONN_ environment variable name.
 * e.g. host -> CONN_HOST, apiKey -> CONN_API_KEY, dbType -> CONN_DB_TYPE
 */
function configKeyToEnvName(key: string): string {
  return `CONN_${key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}`
}

/**
 * Decrypt connection config by connectionId and convert to CONN_* environment variables.
 * Returns empty object if connectionId is invalid or connection does not exist.
 */
export async function resolveConnectionEnvVars(
  connectionId: string
): Promise<Record<string, string>> {
  try {
    const [conn] = await db
      .select({
        configEncrypted: systemConnections.configEncrypted,
        type: systemConnections.type,
      })
      .from(systemConnections)
      .where(eq(systemConnections.id, connectionId))
      .limit(1)

    if (!conn) {
      logger.warn(`Connection not found: ${connectionId}`)
      return {}
    }

    const configJson = decryptConfig(conn.configEncrypted)
    const config = JSON.parse(configJson) as Record<string, unknown>

    const envVars: Record<string, string> = {}
    for (const [key, value] of Object.entries(config)) {
      if (value != null && value !== '') {
        envVars[configKeyToEnvName(key)] = String(value)
      }
    }

    // Additionally inject connection type for tool code convenience
    envVars.CONN_TYPE = conn.type

    return envVars
  } catch (error) {
    logger.error(`Failed to resolve connection config: ${connectionId}`, { error })
    return {}
  }
}

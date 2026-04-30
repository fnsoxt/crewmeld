import { db } from '@crewmeld/db'
import { employeeConnections, modelConfigs, systemConnections } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, asc, eq, ne } from 'drizzle-orm'
import { decryptConfig } from './encryption'
import type { ConnectionConfig, ConnectionType } from './types'

const logger = createLogger('CredentialResolver')

interface ResolvedCredential {
  connectionId: string
  connectionName: string
  type: ConnectionType
  config: ConnectionConfig
}

interface ResolvedModelConfig {
  configId: string
  providerId: string
  displayName: string
  apiKey: string | undefined
  apiEndpoint: string | null
  defaultParams: Record<string, unknown>
}

/**
 * Resolve connection credentials for a specified employee (priority chain: employee binding -> system default -> null)
 * Skips connections with status=error, takes the earliest one sorted by createdAt ascending
 */
export async function resolveCredential(
  employeeId: string,
  connectionType: ConnectionType
): Promise<ResolvedCredential | null> {
  // 1. Find employee-bound connections of the same type
  const boundRows = await db
    .select({
      connectionId: systemConnections.id,
      connectionName: systemConnections.name,
      type: systemConnections.type,
      configEncrypted: systemConnections.configEncrypted,
      status: systemConnections.status,
      createdAt: systemConnections.createdAt,
    })
    .from(employeeConnections)
    .innerJoin(systemConnections, eq(employeeConnections.connectionId, systemConnections.id))
    .where(
      and(
        eq(employeeConnections.employeeId, employeeId),
        eq(systemConnections.type, connectionType),
        ne(systemConnections.status, 'error')
      )
    )
    .orderBy(asc(systemConnections.createdAt))
    .limit(1)

  if (boundRows.length > 0) {
    const row = boundRows[0]
    try {
      const config = JSON.parse(decryptConfig(row.configEncrypted)) as ConnectionConfig
      return {
        connectionId: row.connectionId,
        connectionName: row.connectionName,
        type: row.type as ConnectionType,
        config,
      }
    } catch {
      logger.warn(
        `Failed to decrypt employee bound connection: employee=${employeeId}, connection=${row.connectionId}`
      )
    }
  }

  // 2. Fall back to system default (same type, non-error status, earliest created)
  return resolveSystemDefault(connectionType)
}

/**
 * Get system default connection directly (bypassing employee binding, used for SOP notifications etc.)
 */
export async function resolveSystemDefault(
  connectionType: ConnectionType
): Promise<ResolvedCredential | null> {
  const rows = await db
    .select({
      connectionId: systemConnections.id,
      connectionName: systemConnections.name,
      type: systemConnections.type,
      configEncrypted: systemConnections.configEncrypted,
    })
    .from(systemConnections)
    .where(and(eq(systemConnections.type, connectionType), ne(systemConnections.status, 'error')))
    .orderBy(asc(systemConnections.createdAt))
    .limit(1)

  if (rows.length === 0) {
    return null
  }

  const row = rows[0]
  try {
    const config = JSON.parse(decryptConfig(row.configEncrypted)) as ConnectionConfig
    return {
      connectionId: row.connectionId,
      connectionName: row.connectionName,
      type: row.type as ConnectionType,
      config,
    }
  } catch {
    logger.warn(`Failed to decrypt system default connection: connection=${row.connectionId}`)
    return null
  }
}

/**
 * Find connection credentials by bound digital employee ID
 *
 * Iterates through connections of the same type, matching config.boundEmployeeId === employeeId.
 * Used for approval notification delivery: ensures the Feishu/WeCom app credentials that triggered the conversation are used, avoiding cross-app issues.
 * Returns null if no match (caller should fallback to resolveSystemDefault).
 */
export async function resolveCredentialByBoundEmployee(
  employeeId: string,
  connectionType: ConnectionType
): Promise<ResolvedCredential | null> {
  const all = await resolveAllCredentialsByType(connectionType)

  for (const cred of all) {
    const config = cred.config as Record<string, unknown>
    if (config.boundEmployeeId === employeeId) {
      return cred
    }
  }

  return null
}

/**
 * Get all connection credentials of the same type (for scenarios like webhook signature verification that need to iterate through all keys)
 */
export async function resolveAllCredentialsByType(
  connectionType: ConnectionType
): Promise<ResolvedCredential[]> {
  const rows = await db
    .select({
      connectionId: systemConnections.id,
      connectionName: systemConnections.name,
      type: systemConnections.type,
      configEncrypted: systemConnections.configEncrypted,
    })
    .from(systemConnections)
    .where(and(eq(systemConnections.type, connectionType), ne(systemConnections.status, 'error')))
    .orderBy(asc(systemConnections.createdAt))

  const results: ResolvedCredential[] = []
  for (const row of rows) {
    try {
      const config = JSON.parse(decryptConfig(row.configEncrypted)) as ConnectionConfig
      results.push({
        connectionId: row.connectionId,
        connectionName: row.connectionName,
        type: row.type as ConnectionType,
        config,
      })
    } catch {
      logger.warn(`Failed to decrypt connection (skipped): connection=${row.connectionId}`)
    }
  }

  return results
}

/**
 * Get credentials by connection ID
 */
export async function resolveCredentialById(
  connectionId: string
): Promise<ResolvedCredential | null> {
  const [row] = await db
    .select({
      connectionId: systemConnections.id,
      connectionName: systemConnections.name,
      type: systemConnections.type,
      configEncrypted: systemConnections.configEncrypted,
    })
    .from(systemConnections)
    .where(and(eq(systemConnections.id, connectionId), ne(systemConnections.status, 'error')))
    .limit(1)

  if (!row) return null

  try {
    const config = JSON.parse(decryptConfig(row.configEncrypted)) as ConnectionConfig
    return {
      connectionId: row.connectionId,
      connectionName: row.connectionName,
      type: row.type as ConnectionType,
      config,
    }
  } catch {
    logger.warn(`Failed to decrypt connection: connection=${connectionId}`)
    return null
  }
}

/**
 * Reverse lookup the bound digital employee ID by connectionId
 *
 * Queries the employee_connections table to find the employee bound to this connection.
 * Used for channels like official accounts that don't carry employeeId in the URL.
 */
export async function resolveEmployeeByConnectionId(connectionId: string): Promise<string | null> {
  const [row] = await db
    .select({ employeeId: employeeConnections.employeeId })
    .from(employeeConnections)
    .where(eq(employeeConnections.connectionId, connectionId))
    .limit(1)

  return row?.employeeId ?? null
}

/**
 * Resolve LLM model credentials (take the first active config, optionally filtered by providerId)
 */
export async function resolveModelConfig(providerId?: string): Promise<ResolvedModelConfig | null> {
  const filters = [eq(modelConfigs.isActive, true)]
  if (providerId) {
    filters.push(eq(modelConfigs.providerId, providerId))
  }

  const rows = await db
    .select()
    .from(modelConfigs)
    .where(and(...filters))
    .orderBy(asc(modelConfigs.createdAt))
    .limit(1)

  if (rows.length === 0) {
    return null
  }

  const row = rows[0]
  let apiKey: string | undefined
  if (row.apiKeyEncrypted) {
    try {
      apiKey = decryptConfig(row.apiKeyEncrypted)
    } catch {
      logger.warn(`Failed to decrypt model API key: config=${row.id}`)
    }
  }

  return {
    configId: row.id,
    providerId: row.providerId,
    displayName: row.displayName,
    apiKey,
    apiEndpoint: row.apiEndpoint,
    defaultParams: row.defaultParams as Record<string, unknown>,
  }
}

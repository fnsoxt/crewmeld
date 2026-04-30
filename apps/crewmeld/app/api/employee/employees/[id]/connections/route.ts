import { db } from '@crewmeld/db'
import {
  digitalEmployees,
  employeeConnections,
  systemConnections,
  taskExecutions,
  workLogs,
} from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { getSession } from '@/lib/auth'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { tryConnectDiscordGateway } from '@/lib/channels/plugins/discord/auto-connect'
import { decryptConfig, encryptConfig, maskSensitiveFields } from '@/lib/connectors/encryption'
import type { ConnectionConfig, ConnectionStatus, StatusIndicator } from '@/lib/connectors/types'
import { CHANNEL_TYPE_LIST } from '@/lib/connectors/types'
import { makeLogMetadata } from '@/lib/i18n/log-payload'

const logger = createLogger('EmployeeConnectionsAPI')

function getStatusIndicator(status: ConnectionStatus): StatusIndicator {
  switch (status) {
    case 'connected':
      return 'green'
    case 'error':
      return 'red'
    case 'testing':
      return 'yellow'
    default:
      return 'gray'
  }
}

/**
 * GET: Return employee bound connections + available connections (unbound)
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return apiErr('api.common.unauthorized', { status: 401 })
    }

    const { id: employeeId } = await params

    const [employee] = await db
      .select({ id: digitalEmployees.id })
      .from(digitalEmployees)
      .where(eq(digitalEmployees.id, employeeId))
      .limit(1)

    if (!employee) {
      return apiErr('api.employee.notFound', { status: 404 })
    }

    const boundRows = await db
      .select({
        bindingId: employeeConnections.id,
        connectionId: systemConnections.id,
        name: systemConnections.name,
        type: systemConnections.type,
        description: systemConnections.description,
        status: systemConnections.status,
        lastHealthCheck: systemConnections.lastHealthCheck,
        lastHealthMessageI18n: systemConnections.lastHealthMessageI18n,
        createdAt: systemConnections.createdAt,
        configEncrypted: systemConnections.configEncrypted,
        boundAt: employeeConnections.createdAt,
      })
      .from(employeeConnections)
      .innerJoin(systemConnections, eq(employeeConnections.connectionId, systemConnections.id))
      .where(eq(employeeConnections.employeeId, employeeId))

    const boundConnectionIds = new Set(boundRows.map((r) => r.connectionId))

    const allConnections = await db
      .select()
      .from(systemConnections)
      .orderBy(systemConnections.createdAt)

    const bound = boundRows.map((row) => {
      let config: Record<string, unknown> = {}
      try {
        config = maskSensitiveFields(JSON.parse(decryptConfig(row.configEncrypted)))
      } catch {
        logger.warn(`Failed to decrypt connection config: ${row.connectionId}`)
      }
      return {
        bindingId: row.bindingId,
        connectionId: row.connectionId,
        name: row.name,
        type: row.type,
        description: row.description,
        status: row.status,
        statusIndicator: getStatusIndicator(row.status as ConnectionStatus),
        lastHealthCheck: row.lastHealthCheck?.toISOString() ?? null,
        lastHealthMessageI18n: row.lastHealthMessageI18n ?? null,
        createdAt: row.createdAt?.toISOString() ?? '',
        boundAt: row.boundAt?.toISOString() ?? '',
        config,
      }
    })

    // Find all channel-type connections already bound by any employee
    const channelTypeConnIds = allConnections
      .filter((c) => CHANNEL_TYPE_LIST.includes(c.type as (typeof CHANNEL_TYPE_LIST)[number]))
      .map((c) => c.id)

    let channelsBoundByOthers = new Set<string>()
    if (channelTypeConnIds.length > 0) {
      const otherBindings = await db
        .select({ connectionId: employeeConnections.connectionId })
        .from(employeeConnections)
        .where(inArray(employeeConnections.connectionId, channelTypeConnIds))
      // Channel connectionIds bound by anyone (including self)
      const allBoundChannelIds = new Set(otherBindings.map((r) => r.connectionId))
      // Self-bound channels don't count as "bound by others"
      channelsBoundByOthers = new Set(
        [...allBoundChannelIds].filter((id) => !boundConnectionIds.has(id))
      )
    }

    const available = allConnections
      .filter((c) => !boundConnectionIds.has(c.id))
      .filter((c) => !channelsBoundByOthers.has(c.id)) // Hide channels already bound by other employees
      .map((c) => ({
        connectionId: c.id,
        name: c.name,
        type: c.type,
        description: c.description,
        status: c.status,
        statusIndicator: getStatusIndicator(c.status as ConnectionStatus),
        isChannel: CHANNEL_TYPE_LIST.includes(c.type as (typeof CHANNEL_TYPE_LIST)[number]),
      }))

    const boundWithFlag = bound.map((b) => ({
      ...b,
      isChannel: CHANNEL_TYPE_LIST.includes(b.type as (typeof CHANNEL_TYPE_LIST)[number]),
    }))

    return apiOk({ bound: boundWithFlag, available })
  } catch (error) {
    logger.error('Failed to fetch employee connections', error)
    return apiErr('api.employee.fetchConnectionsFailed', { status: 500 })
  }
}

/**
 * POST: Bind a connection to an employee
 */
async function _POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('employee:edit')
    if (auth.error) {
      return apiAuthErr(auth)
    }

    const { id: employeeId } = await params

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return apiErr('api.common.invalidBody', { status: 400 })
    }

    const { connectionId } = body
    if (!connectionId || typeof connectionId !== 'string') {
      return apiErr('api.employee.connectionIdRequired', { status: 400 })
    }

    const [employee] = await db
      .select({ id: digitalEmployees.id })
      .from(digitalEmployees)
      .where(eq(digitalEmployees.id, employeeId))
      .limit(1)

    if (!employee) {
      return apiErr('api.employee.notFound', { status: 404 })
    }

    const [connection] = await db
      .select({
        id: systemConnections.id,
        type: systemConnections.type,
        name: systemConnections.name,
      })
      .from(systemConnections)
      .where(eq(systemConnections.id, connectionId))
      .limit(1)

    if (!connection) {
      return apiErr('api.employee.connectionNotFound', { status: 404 })
    }

    const [existing] = await db
      .select({ id: employeeConnections.id })
      .from(employeeConnections)
      .where(
        and(
          eq(employeeConnections.employeeId, employeeId),
          eq(employeeConnections.connectionId, connectionId)
        )
      )
      .limit(1)

    if (existing) {
      return apiErr('api.employee.connectionAlreadyBound', { status: 409 })
    }

    // Channel type 1:1 constraint: one channel can only bind to one employee
    const isChannel = CHANNEL_TYPE_LIST.includes(
      connection.type as (typeof CHANNEL_TYPE_LIST)[number]
    )
    if (isChannel) {
      const [otherBinding] = await db
        .select({
          employeeId: employeeConnections.employeeId,
          employeeName: digitalEmployees.name,
        })
        .from(employeeConnections)
        .innerJoin(digitalEmployees, eq(employeeConnections.employeeId, digitalEmployees.id))
        .where(eq(employeeConnections.connectionId, connectionId))
        .limit(1)

      if (otherBinding) {
        return apiErr('api.employee.channelAlreadyBoundToOther', {
          status: 409,
          params: { employeeName: otherBinding.employeeName },
        })
      }
    }

    const bindingId = `ec_${nanoid(16)}`
    await db.insert(employeeConnections).values({
      id: bindingId,
      employeeId,
      connectionId,
    })

    // Channel type: sync back config.boundEmployeeId
    if (isChannel) {
      try {
        const [connRow] = await db
          .select({ configEncrypted: systemConnections.configEncrypted })
          .from(systemConnections)
          .where(eq(systemConnections.id, connectionId))
          .limit(1)

        if (connRow) {
          const config = JSON.parse(decryptConfig(connRow.configEncrypted))
          config.boundEmployeeId = employeeId
          await db
            .update(systemConnections)
            .set({
              configEncrypted: encryptConfig(JSON.stringify(config)),
              updatedAt: new Date(),
            })
            .where(eq(systemConnections.id, connectionId))
        }
      } catch (e) {
        logger.warn(`Failed to sync boundEmployeeId: connection=${connectionId}`, e)
      }
    }

    // Reconnect Discord Gateway after channel binding (load latest boundEmployeeId)
    if (connection.type === 'discord') {
      try {
        const [connRow] = await db
          .select({ configEncrypted: systemConnections.configEncrypted })
          .from(systemConnections)
          .where(eq(systemConnections.id, connectionId))
          .limit(1)
        if (connRow) {
          const latestConfig = JSON.parse(
            decryptConfig(connRow.configEncrypted)
          ) as ConnectionConfig
          tryConnectDiscordGateway(connectionId, latestConfig).catch((err) => {
            logger.warn('Discord Gateway reconnect after binding failed', {
              connectionId,
              error: err,
            })
          })
        }
      } catch (e) {
        logger.warn('Discord Gateway reconnect after binding exception', { connectionId, error: e })
      }
    }

    // Write work log
    const now = new Date()
    const taskId = `task_${nanoid()}`
    await db.insert(taskExecutions).values({
      id: taskId,
      employeeId,
      triggerType: 'manual',
      status: 'success',
      input: { action: 'connection_bind', connectionId },
      inputSummary: `Bound connection "${connection.name}"`,
      outputSummary: `Bound connection "${connection.name}"`,
      durationMs: 0,
      startedAt: now,
      completedAt: now,
    })
    await db.insert(workLogs).values({
      id: `log_${nanoid()}`,
      taskId,
      employeeId,
      logType: 'action',
      content: `Bound connection "${connection.name}"`,
      metadata: makeLogMetadata(
        {
          action: 'connection_bind',
          connectionId,
          connectionName: connection.name,
          connectionType: connection.type,
        },
        { i18nKey: 'logActionConnectionBind', i18nParams: { name: connection.name } }
      ),
    })

    logger.info(`Connection bound: employee=${employeeId}, connection=${connectionId}`)

    return apiOk({ id: bindingId, employeeId, connectionId }, { status: 201 })
  } catch (error) {
    logger.error('Failed to bind connection', error)
    return apiErr('api.employee.connectionBindFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)

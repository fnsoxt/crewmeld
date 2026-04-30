import { db } from '@crewmeld/db'
import {
  employeeConnections,
  systemConnections,
  taskExecutions,
  workLogs,
} from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { decryptConfig, encryptConfig } from '@/lib/connectors/encryption'
import { CHANNEL_TYPE_LIST } from '@/lib/connectors/types'
import { makeLogMetadata } from '@/lib/i18n/log-payload'

const logger = createLogger('EmployeeConnectionUnbindAPI')

/**
 * DELETE: Unbind a connection from an employee
 */
async function _DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; connectionId: string }> }
) {
  try {
    const auth = await requirePermission('employee:edit')
    if (auth.error) {
      return apiAuthErr(auth)
    }

    const { id: employeeId, connectionId } = await params

    const [binding] = await db
      .select({ id: employeeConnections.id })
      .from(employeeConnections)
      .where(
        and(
          eq(employeeConnections.employeeId, employeeId),
          eq(employeeConnections.connectionId, connectionId)
        )
      )
      .limit(1)

    if (!binding) {
      return apiErr('api.employee.connectionBindingNotFound', { status: 404 })
    }

    await db.delete(employeeConnections).where(eq(employeeConnections.id, binding.id))

    // Channel type: clear config.boundEmployeeId
    const [connRow] = await db
      .select({
        type: systemConnections.type,
        name: systemConnections.name,
        configEncrypted: systemConnections.configEncrypted,
      })
      .from(systemConnections)
      .where(eq(systemConnections.id, connectionId))
      .limit(1)

    if (connRow && CHANNEL_TYPE_LIST.includes(connRow.type as (typeof CHANNEL_TYPE_LIST)[number])) {
      try {
        const config = JSON.parse(decryptConfig(connRow.configEncrypted))
        config.boundEmployeeId = null
        await db
          .update(systemConnections)
          .set({
            configEncrypted: encryptConfig(JSON.stringify(config)),
            updatedAt: new Date(),
          })
          .where(eq(systemConnections.id, connectionId))
      } catch (e) {
        logger.warn(`Failed to clear boundEmployeeId: connection=${connectionId}`, e)
      }
    }

    // Write work log
    if (connRow) {
      const connectionName = connRow.name
      const now = new Date()
      const taskId = `task_${nanoid()}`
      await db.insert(taskExecutions).values({
        id: taskId,
        employeeId,
        triggerType: 'manual',
        status: 'success',
        input: { action: 'connection_unbind', connectionId },
        inputSummary: `Unbound connection "${connectionName}"`,
        outputSummary: `Unbound connection "${connectionName}"`,
        durationMs: 0,
        startedAt: now,
        completedAt: now,
      })
      await db.insert(workLogs).values({
        id: `log_${nanoid()}`,
        taskId,
        employeeId,
        logType: 'action',
        content: `Unbound connection "${connectionName}"`,
        metadata: makeLogMetadata(
          {
            action: 'connection_unbind',
            connectionId,
            connectionName,
            connectionType: connRow.type,
          },
          { i18nKey: 'logActionConnectionUnbind', i18nParams: { name: connectionName } }
        ),
      })
    }

    logger.info(`Connection unbound: employee=${employeeId}, connection=${connectionId}`)

    return apiOk(null, { message: 'api.employee.connectionUnbound' })
  } catch (error) {
    logger.error('Failed to unbind connection', error)
    return apiErr('api.employee.connectionUnbindFailed', { status: 500 })
  }
}

export const DELETE = withAudit(_DELETE)

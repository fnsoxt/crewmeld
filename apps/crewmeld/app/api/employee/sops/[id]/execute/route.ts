import { db } from '@crewmeld/db'
import { sopDefinitions, sopExecutions } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { executeSop, transitionStatus } from '@/lib/sop/engine'
import { getSopTimeoutQueue } from '@/lib/sop/queue'
import { validateSopForExecution } from '@/lib/sop/validator'
import type { SopNode, SopSerializedEdge } from '@/types/sop'

const logger = createLogger('API:Sops:Execute')

async function _POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('sop:edit')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params

    const defRows = await db.select().from(sopDefinitions).where(eq(sopDefinitions.id, id))
    const definition = defRows[0]

    if (!definition || !definition.isActive) {
      return apiErr('api.sop.notFoundOrInactive', { status: 404 })
    }

    const validation = await validateSopForExecution(
      (definition.nodes ?? []) as SopNode[],
      (definition.edges ?? []) as SopSerializedEdge[]
    )
    if (!validation.valid) {
      return apiErr('api.sop.validationFailed', {
        status: 422,
        extra: { validationErrors: validation.errors },
      })
    }

    let triggerData: Record<string, unknown> = {}
    try {
      const body = await request.json()
      if (body.triggerData) triggerData = body.triggerData
    } catch {
      // Empty body is fine for manual trigger
    }

    const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
    if (host) {
      const proto = request.headers.get('x-forwarded-proto') || 'http'
      const baseUrl = `${proto}://${host}`
      triggerData._meta = { ...((triggerData._meta as Record<string, unknown>) ?? {}), baseUrl }
    }

    const executionId = `sopexec_${nanoid(16)}`

    await db.insert(sopExecutions).values({
      id: executionId,
      sopDefinitionId: id,
      sopVersion: definition.version,
      triggeredBy: auth.userId!,
      status: 'pending',
      stateSnapshot: {},
      triggerData,
    })

    const timeoutQueue = getSopTimeoutQueue()
    if (timeoutQueue && definition.sopTimeoutMinutes > 0) {
      await timeoutQueue.add(
        'sop-timeout',
        {
          executionId,
          type: 'sop',
        },
        { delay: definition.sopTimeoutMinutes * 60 * 1000 }
      )
    }

    const transitioned = await transitionStatus(executionId, 'pending', 'running', {
      startedAt: new Date(),
    })

    if (!transitioned) {
      return apiErr('api.sop.startFailed', { status: 500 })
    }

    void executeSop(executionId)

    logger.info('SOP execution triggered', { sopId: id, executionId })

    return apiOk({ executionId })
  } catch (error) {
    logger.error('Failed to trigger SOP execution', error)
    return apiErr('api.sop.triggerFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)

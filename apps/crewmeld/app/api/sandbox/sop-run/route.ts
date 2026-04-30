import { db } from '@crewmeld/db'
import { sandboxRuns, sopDefinitions } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { executeSopSandbox } from '@/lib/sandbox/sop-sandbox-executor'
import { validateSopForExecution } from '@/lib/sop/validator'
import { DEFAULT_EXTERNAL_CALL_POLICY, type ExternalCallPolicy } from '@/types/sandbox'
import type { SopNode, SopSerializedEdge } from '@/types/sop'

const logger = createLogger('API:Sandbox:SopRun')

/**
 * POST /api/sandbox/sop-run — Trigger a SOP sandbox dry run.
 *
 * Body: { sop_definition_id, trigger_data?, policy? }
 * Response: { runId }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('sop:edit')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    let body: {
      sop_definition_id?: string
      trigger_data?: Record<string, unknown>
      policy?: Partial<ExternalCallPolicy>
    }
    try {
      body = await request.json()
    } catch {
      return apiErr('api.common.invalidBody', { status: 400 })
    }

    const { sop_definition_id, trigger_data, policy } = body

    if (!sop_definition_id) {
      return apiErr('api.sandbox.sopDefinitionIdRequired', { status: 400 })
    }

    const [definition] = await db
      .select()
      .from(sopDefinitions)
      .where(eq(sopDefinitions.id, sop_definition_id))
      .limit(1)

    if (!definition) {
      return apiErr('api.sandbox.sopDefinitionNotFound', { status: 404 })
    }

    const validation = await validateSopForExecution(
      (definition.nodes ?? []) as SopNode[],
      (definition.edges ?? []) as SopSerializedEdge[]
    )
    if (!validation.valid) {
      return apiErr('api.sandbox.sopValidationFailed', {
        status: 422,
        extra: { validationErrors: validation.errors },
      })
    }

    const runId = `sbx_sop_${nanoid(16)}`
    const mergedPolicy: ExternalCallPolicy = { ...DEFAULT_EXTERNAL_CALL_POLICY, ...(policy ?? {}) }
    const triggerData = trigger_data ?? {}

    await db.insert(sandboxRuns).values({
      id: runId,
      runType: 'sop_run',
      status: 'pending',
      sopDefinitionId: sop_definition_id,
      triggerData,
      policy: mergedPolicy,
      createdBy: auth.userId!,
    })

    void executeSopSandbox({
      runId,
      sopDefinitionId: sop_definition_id,
      triggerData,
      policy: mergedPolicy,
      userId: auth.userId!,
    })

    logger.info('SOP sandbox run started', { runId, sopDefinitionId: sop_definition_id })

    return apiOk({ runId })
  } catch (error) {
    logger.error('Failed to start SOP sandbox', error)
    return apiErr('api.sandbox.createSopRunFailed', { status: 500 })
  }
}

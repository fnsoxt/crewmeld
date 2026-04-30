import { db } from '@crewmeld/db'
import { toolInstances, tools } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import {
  deploySkill,
  getDeployStatus,
  initWarmPool,
  isK8sConfigured,
  isWarmPoolEnabled,
  undeploySkill,
} from '@/lib/k8s/deploy-skill'
import type { DeployInfo } from '@/app/(employee)/skills/types'

const logger = createLogger('InstanceDeployAPI')

let poolInitialized = false
async function ensureWarmPool(): Promise<void> {
  if (poolInitialized || !isWarmPoolEnabled()) return
  poolInitialized = true
  try {
    await initWarmPool()
    logger.info('Warm pool initialized')
  } catch (err) {
    logger.warn(
      `Warm pool initialization failed: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

async function _POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('skill:deploy')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    await ensureWarmPool()

    if (!isK8sConfigured()) {
      return apiErr('api.skill.k8sNotConfigured', { status: 503 })
    }

    const { id } = await params

    const [instance] = await db
      .select()
      .from(toolInstances)
      .where(eq(toolInstances.id, id))
      .limit(1)

    if (!instance) {
      return apiErr('api.skill.instanceNotFound', { status: 404 })
    }

    const [template] = await db
      .select({
        id: tools.id,
        name: tools.name,
        code: tools.code,
        language: tools.language,
        parameters: tools.parameters,
        envVars: tools.envVars,
      })
      .from(tools)
      .where(eq(tools.id, instance.templateId))
      .limit(1)

    if (!template?.code) {
      return apiErr('api.skill.templateCodeMissing', { status: 400 })
    }

    const skill = {
      id: instance.id,
      name: instance.name,
      code: template.code,
      language: template.language,
      parameters: template.parameters,
      presetParams: instance.presetParams,
      envVars:
        (instance.envVars as Array<{ name: string; value: string }> | undefined) ??
        (template.envVars as Array<{ name: string; value: string }> | undefined),
    }

    logger.info('Start instance deployment', { instanceId: id, templateId: instance.templateId })

    const { endpoint, nodePort } = await deploySkill(skill as Parameters<typeof deploySkill>[0])

    const deploy: DeployInfo = {
      status: 'deployed',
      endpoint,
      nodePort,
      deployedAt: new Date().toISOString(),
    }

    await db
      .update(toolInstances)
      .set({ deploy, updatedAt: new Date() })
      .where(eq(toolInstances.id, id))

    logger.info('Instance deployed successfully', { instanceId: id, endpoint })
    return apiOk(null, { extra: { deploy } })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error('Instance deployment failed', { error: msg })
    return apiErr('api.skill.deployFailed', { status: 500, extra: { detail: msg } })
  }
}

async function _DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('skill:deploy')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params
    logger.info('Start instance undeployment', { id })

    await undeploySkill(id)

    const deploy: DeployInfo = { status: 'not_deployed' }
    await db
      .update(toolInstances)
      .set({ deploy, updatedAt: new Date() })
      .where(eq(toolInstances.id, id))

    logger.info('Instance undeployed successfully', { id })
    return apiOk(null, { extra: { deploy } })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error('Instance undeployment failed', { error: msg })
    return apiErr('api.skill.undeployFailed', { status: 500, extra: { detail: msg } })
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('skill:deploy')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params
    const status = await getDeployStatus(id)
    return apiOk(null, { extra: status })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return apiErr('api.skill.statusQueryFailed', { status: 500, extra: { detail: msg } })
  }
}

export const POST = withAudit(_POST)
export const DELETE = withAudit(_DELETE)

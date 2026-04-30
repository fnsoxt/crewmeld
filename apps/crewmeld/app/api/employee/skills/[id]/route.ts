import { db } from '@crewmeld/db'
import { toolInstances, tools } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import { apiAuthErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { undeploySkill } from '@/lib/k8s/deploy-skill'
import type { DeployInfo } from '@/app/(employee)/skills/types'

const logger = createLogger('SkillTemplateAPI')

async function _DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('skill:delete')
  if (!auth.authenticated || auth.error) {
    return apiAuthErr(auth)
  }

  const { id } = await params

  const instances = await db
    .select({ id: toolInstances.id, deploy: toolInstances.deploy })
    .from(toolInstances)
    .where(eq(toolInstances.templateId, id))

  for (const inst of instances) {
    const deploy = inst.deploy as DeployInfo | null
    if (deploy?.status === 'deployed') {
      try {
        await undeploySkill(inst.id)
        logger.info('Auto-unpublishing instances before template uninstall', {
          instanceId: inst.id,
        })
      } catch (err) {
        logger.warn(
          `Instance unpublish failed, proceeding with uninstall: ${err instanceof Error ? err.message : String(err)}`,
          { instanceId: inst.id }
        )
      }
    }
  }

  if (instances.length > 0) {
    await db.delete(toolInstances).where(eq(toolInstances.templateId, id))
  }

  await db.delete(tools).where(eq(tools.id, id))

  return apiOk(null)
}

export const DELETE = withAudit(_DELETE)

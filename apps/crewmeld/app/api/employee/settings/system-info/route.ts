import { freemem, totalmem } from 'node:os'
import { db } from '@crewmeld/db'
import { digitalEmployees, taskExecutions, user as userTable } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { count } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { resolveLocale } from '@/lib/i18n/server-locale'
import { getLicenseStatus } from '@/lib/license/cache'
import { runHealthChecks } from '@/lib/system/health-check'
import type {
  DeploymentInfo,
  SystemInfoResponse,
  VersionInfo,
} from '@/app/(employee)/settings/types'

export const dynamic = 'force-dynamic'

const logger = createLogger('API:SystemInfo')

/** Read version info */
async function getVersionInfo(): Promise<VersionInfo> {
  let dbVersion: string | null = null
  try {
    const { sql } = await import('drizzle-orm')
    const result = await db.execute(sql`SELECT version()`)
    const rows = result as unknown as { rows?: Array<{ version?: string }> }
    const raw = rows.rows?.[0]?.version ?? null
    dbVersion = raw ? (raw.split(',')[0] ?? raw) : null
  } catch {
    logger.warn('Unable to get database version')
  }

  // `||` (not `??`) so an empty-string env value also falls back to the default.
  const baseVersion = process.env.CREWMELD_APP_VERSION || '0.1'
  const buildDate = process.env.CREWMELD_BUILD_DATE || 'dev'
  return {
    // Keep the full `${base}.${build}` string aligned with /api/system/info
    // so the settings Version card and the dashboard system-status card agree.
    appVersion: `${baseVersion}.${buildDate}`,
    buildDate: process.env.CREWMELD_BUILD_DATE || null,
    gitCommit: process.env.CREWMELD_GIT_COMMIT ?? null,
    nodeVersion: process.version,
    dbVersion,
  }
}

/** Read K8s deployment info (only has values in Helm deployments) */
function getDeploymentInfo(): DeploymentInfo | null {
  if (process.env.CREWMELD_DEPLOY_MODE !== 'k8s') return null
  return {
    mode: 'k8s',
    namespace: process.env.CREWMELD_K8S_NAMESPACE ?? null,
    podName: process.env.CREWMELD_K8S_POD_NAME ?? null,
    nodeName: process.env.CREWMELD_K8S_NODE_NAME ?? null,
    helmRelease: process.env.CREWMELD_HELM_RELEASE ?? null,
    chartVersion: process.env.CREWMELD_HELM_CHART_VERSION ?? null,
  }
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission('system:view')
  if (!auth.authenticated || auth.error) {
    return apiAuthErr(auth)
  }

  try {
    const locale = resolveLocale(request)
    const lang = locale === 'en' ? 'en' : 'zh'
    const [versionInfo, employeeCountResult, userCountResult, taskCountResult, healthCheck] =
      await Promise.all([
        getVersionInfo(),
        db.select({ count: count() }).from(digitalEmployees),
        db.select({ count: count() }).from(userTable),
        db.select({ count: count() }).from(taskExecutions),
        runHealthChecks(lang),
      ])

    const employeeCount = employeeCountResult[0]?.count ?? 0
    const userCount = userCountResult[0]?.count ?? 0
    const taskCount = taskCountResult[0]?.count ?? 0

    const license = getLicenseStatus(employeeCount)

    const totalMemBytes = totalmem()
    const freeMemBytes = freemem()
    const usedMemBytes = totalMemBytes - freeMemBytes
    const totalMemMb = Math.round(totalMemBytes / (1024 * 1024))
    const usedMemMb = Math.round(usedMemBytes / (1024 * 1024))

    let diskUsage = { usedGb: 0, totalGb: 0, usagePercent: 0 }
    try {
      const { statfsSync } = await import('node:fs')
      const stats = statfsSync('/')
      const totalBytes = stats.blocks * stats.bsize
      const freeBytes = stats.bavail * stats.bsize
      const usedBytes = totalBytes - freeBytes
      diskUsage = {
        usedGb: Math.round((usedBytes / (1024 * 1024 * 1024)) * 10) / 10,
        totalGb: Math.round((totalBytes / (1024 * 1024 * 1024)) * 10) / 10,
        usagePercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0,
      }
    } catch {
      logger.warn('Unable to get disk usage info')
    }

    const response: SystemInfoResponse = {
      version: versionInfo,
      license: license.status,
      healthCheck:
        healthCheck as unknown as import('@/app/(employee)/settings/types').HealthCheckResult,
      deploymentInfo: getDeploymentInfo(),
      stats: {
        totalUsers: userCount,
        totalEmployees: employeeCount,
        totalTasksExecuted: taskCount,
        uptimeSeconds: Math.floor(process.uptime()),
        memoryUsage: {
          usedMb: usedMemMb,
          totalMb: totalMemMb,
          usagePercent: totalMemMb > 0 ? Math.round((usedMemMb / totalMemMb) * 1000) / 10 : 0,
        },
        diskUsage,
      },
    }

    logger.info('System info query succeeded')

    return apiOk(response)
  } catch (error) {
    logger.error('System info query failed', error)
    return apiErr('api.setting.systemInfoQueryFailed', { status: 500 })
  }
}

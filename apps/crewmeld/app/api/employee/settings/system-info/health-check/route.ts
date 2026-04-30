import { createLogger } from '@crewmeld/logger'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { resolveLocale } from '@/lib/i18n/server-locale'
import { runHealthChecks } from '@/lib/system/health-check'

export const dynamic = 'force-dynamic'

const logger = createLogger('API:HealthCheck')

async function _POST(request: NextRequest) {
  const auth = await requirePermission('system:health_check')
  if (!auth.authenticated || auth.error) {
    return apiAuthErr(auth)
  }

  try {
    const locale = resolveLocale(request)
    const lang = locale === 'en' ? 'en' : 'zh'
    const result = await runHealthChecks(lang)

    logger.info('Manual health check completed')

    return apiOk(result)
  } catch (error) {
    logger.error('Manual health check failed', error)
    return apiErr('api.setting.healthCheckFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)

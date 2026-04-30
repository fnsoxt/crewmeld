import { db } from '@crewmeld/db'
import { digitalEmployees } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'

const logger = createLogger('EmployeeTestRunAPI')

async function _POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('employee:edit')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params

    const [employee] = await db
      .select({
        id: digitalEmployees.id,
        name: digitalEmployees.name,
        config: digitalEmployees.config,
      })
      .from(digitalEmployees)
      .where(eq(digitalEmployees.id, id))
      .limit(1)

    if (!employee) {
      return apiErr('api.employee.notFound', { status: 404 })
    }

    let input: Record<string, unknown> = {}
    try {
      const body = await request.json()
      input = typeof body.input === 'object' && body.input !== null ? body.input : {}
    } catch {
      return apiErr('api.common.invalidBody', { status: 400 })
    }

    const startTime = Date.now()

    // Mock: simulate execution delay
    await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 1200))

    const duration = Date.now() - startTime
    const now = new Date()

    const result = {
      executionId: `test-run-${nanoid(8)}`,
      status: 'success' as const,
      output: {
        summaryKey: 'api.testRun.summarySuccess',
        summaryParams: { name: employee.name },
        inputReceived: input,
        processedAt: now.toISOString(),
      },
      logs: [
        {
          timestamp: new Date(now.getTime() - duration).toISOString(),
          level: 'info' as const,
          messageKey: 'api.testRun.logStart',
          messageParams: { name: employee.name },
        },
        {
          timestamp: new Date(now.getTime() - Math.floor(duration * 0.6)).toISOString(),
          level: 'info' as const,
          messageKey: 'api.testRun.logLoadConfig',
        },
        {
          timestamp: new Date(now.getTime() - Math.floor(duration * 0.3)).toISOString(),
          level: 'info' as const,
          messageKey: 'api.testRun.logRunWorkflow',
        },
        {
          timestamp: now.toISOString(),
          level: 'info' as const,
          messageKey: 'api.testRun.logSuccess',
          messageParams: { duration },
        },
      ],
      duration,
    }

    logger.info(`Test-run completed: ${employee.name} (${id}), duration=${duration}ms`)

    return apiOk(result)
  } catch (error) {
    logger.error('Test-run failed', error)
    return apiErr('api.employee.testRunFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)

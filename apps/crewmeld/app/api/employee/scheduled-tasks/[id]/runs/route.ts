import { db } from '@crewmeld/db'
import { sopExecutions } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { desc, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'

const logger = createLogger('API:ScheduledTasks:Runs')

/**
 * GET /api/employee/scheduled-tasks/:id/runs — Get execution records for a scheduled task
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('sop:list')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params
    const url = new URL(request.url)
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 20))

    const rows = await db
      .select({
        id: sopExecutions.id,
        status: sopExecutions.status,
        startedAt: sopExecutions.startedAt,
        completedAt: sopExecutions.completedAt,
        errorMessage: sopExecutions.errorMessage,
        createdAt: sopExecutions.createdAt,
      })
      .from(sopExecutions)
      .where(eq(sopExecutions.scheduledTaskId, id))
      .orderBy(desc(sopExecutions.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    const data = rows.map((r) => ({
      id: r.id,
      status: r.status,
      startedAt: r.startedAt?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
      errorMessage: r.errorMessage,
      createdAt: r.createdAt.toISOString(),
    }))

    return apiOk(data)
  } catch (error) {
    logger.error('Failed to fetch scheduled task runs', error)
    return apiErr('api.scheduledTask.fetchRunsFailed', { status: 500 })
  }
}

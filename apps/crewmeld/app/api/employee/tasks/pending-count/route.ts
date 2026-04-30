import { db } from '@crewmeld/db'
import type { SopExecutionStatus } from '@crewmeld/db/schema'
import { sopExecutions, sopPauseStates } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { count, eq, inArray } from 'drizzle-orm'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'

const logger = createLogger('PendingCountAPI')

/** Active statuses: consistent with task center "In Progress" tab */
const ACTIVE_STATUSES: SopExecutionStatus[] = ['pending', 'running', 'paused_for_human']

export async function GET() {
  try {
    const auth = await requirePermission('task:list')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    // Active SOP execution count (sidebar badge, consistent with "In Progress" tab)
    const [activeResult] = await db
      .select({ value: count() })
      .from(sopExecutions)
      .where(inArray(sopExecutions.status, ACTIVE_STATUSES))

    // Pending approval count (human confirmation nodes)
    const [waitingResult] = await db
      .select({ value: count() })
      .from(sopPauseStates)
      .where(eq(sopPauseStates.status, 'waiting'))

    return apiOk({
      count: activeResult?.value ?? 0,
      waitingCount: waitingResult?.value ?? 0,
    })
  } catch (error) {
    logger.error('Failed to fetch task count', error)
    return apiErr('api.task.fetchPendingCountFailed', { status: 500 })
  }
}

/**
 * Daily stats sync stub — the full implementation aggregates across
 * sop_executions + task_executions; P0 defers that aggregation to P1.
 * Callers get a no-op that succeeds so routes continue to respond.
 *
 * TODO: P1 port real implementation from upstream engine.
 */

import { createLogger } from '@crewmeld/logger'

const logger = createLogger('DailyStatsSyncStub')

export async function syncTodayDailyStats(): Promise<void> {
  logger.debug('syncTodayDailyStats: skipped (P0 stub)')
}

/**
 * Execution files stub. The full implementation (workflow input file
 * preprocessing) will be ported alongside the workflow executor in a
 * later wave. lib/uploads only requires the function signature.
 */

import { createLogger } from '@crewmeld/logger'
import type { UserFile } from '@/lib/types/execution'

const logger = createLogger('ExecutionFiles')

/**
 * Process all files for a given field in workflow execution input.
 *
 * NOTE: Stub implementation — returns an empty array. Full base64/URL
 * download handling is gated on the executor port.
 */
export async function processExecutionFiles(
  fieldValue: unknown,
  executionContext: { workspaceId: string; workflowId: string; executionId: string },
  requestId: string,
  userId?: string
): Promise<UserFile[]> {
  if (!fieldValue || typeof fieldValue !== 'object') {
    return []
  }

  logger.debug(
    `[${requestId}] processExecutionFiles stub invoked (workspace=${executionContext.workspaceId}, user=${userId ?? 'anonymous'})`
  )

  return []
}

import { createLogger } from '@crewmeld/logger'
import { isCustomTool } from '@/lib/core/tool-kinds'
import type { ToolResponse } from '@/lib/types/tool-response'

const logger = createLogger('ExecuteCustomSkill')

/**
 * Dispatch an LLM tool call to a custom Skill deployed in the K8s Warm Pool.
 * Non-custom tool IDs are rejected — there is no built-in tool registry in crewmeld.
 */
export async function executeTool(
  toolId: string,
  _params: Record<string, unknown>,
  _context?: { workflowId?: string; userId?: string }
): Promise<ToolResponse> {
  if (!isCustomTool(toolId)) {
    logger.warn(`Unknown tool ID rejected: ${toolId}`)
    return { success: false, output: {}, error: `Unknown tool: ${toolId}` }
  }
  // Placeholder for K8s Skill dispatch — actual implementation lives in lib/k8s/
  // and is wired via SOP node-executor + lib/conversation runtime.
  logger.info(`Custom skill dispatch: ${toolId}`)
  return {
    success: false,
    output: {},
    error: 'Custom skill dispatch not yet wired from this entry point',
  }
}

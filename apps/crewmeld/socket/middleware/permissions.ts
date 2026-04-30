import { createLogger } from '@crewmeld/logger'
import {
  BLOCK_OPERATIONS,
  BLOCKS_OPERATIONS,
  EDGE_OPERATIONS,
  EDGES_OPERATIONS,
  SUBBLOCK_OPERATIONS,
  SUBFLOW_OPERATIONS,
  VARIABLE_OPERATIONS,
  WORKFLOW_OPERATIONS,
} from '@/socket/constants'

const logger = createLogger('SocketPermissions')

async function authorizeWorkflowByWorkspacePermission(_params: {
  workflowId?: string | null
  userId: string
  action?: string
}): Promise<{ allowed: boolean; workspacePermission?: string; message?: string }> {
  return { allowed: true, workspacePermission: 'admin' }
}

// Admin-only operations (require admin role)
const ADMIN_ONLY_OPERATIONS: string[] = [BLOCKS_OPERATIONS.BATCH_TOGGLE_LOCKED]

// Write operations (admin and write roles both have these permissions)
const WRITE_OPERATIONS: string[] = [
  // Block operations
  BLOCK_OPERATIONS.UPDATE_POSITION,
  BLOCK_OPERATIONS.UPDATE_NAME,
  BLOCK_OPERATIONS.TOGGLE_ENABLED,
  BLOCK_OPERATIONS.UPDATE_PARENT,
  BLOCK_OPERATIONS.UPDATE_ADVANCED_MODE,
  BLOCK_OPERATIONS.UPDATE_CANONICAL_MODE,
  BLOCK_OPERATIONS.TOGGLE_HANDLES,
  // Batch block operations
  BLOCKS_OPERATIONS.BATCH_UPDATE_POSITIONS,
  BLOCKS_OPERATIONS.BATCH_ADD_BLOCKS,
  BLOCKS_OPERATIONS.BATCH_REMOVE_BLOCKS,
  BLOCKS_OPERATIONS.BATCH_TOGGLE_ENABLED,
  BLOCKS_OPERATIONS.BATCH_TOGGLE_HANDLES,
  BLOCKS_OPERATIONS.BATCH_UPDATE_PARENT,
  // Edge operations
  EDGE_OPERATIONS.ADD,
  EDGE_OPERATIONS.REMOVE,
  // Batch edge operations
  EDGES_OPERATIONS.BATCH_ADD_EDGES,
  EDGES_OPERATIONS.BATCH_REMOVE_EDGES,
  // Subflow operations
  SUBFLOW_OPERATIONS.UPDATE,
  // Subblock operations
  SUBBLOCK_OPERATIONS.UPDATE,
  // Variable operations
  VARIABLE_OPERATIONS.UPDATE,
  // Workflow operations
  WORKFLOW_OPERATIONS.REPLACE_STATE,
]

// Read role can only update positions (for cursor sync, etc.)
const READ_OPERATIONS: string[] = [
  BLOCK_OPERATIONS.UPDATE_POSITION,
  BLOCKS_OPERATIONS.BATCH_UPDATE_POSITIONS,
]

// Define operation permissions based on role
const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [...ADMIN_ONLY_OPERATIONS, ...WRITE_OPERATIONS],
  write: WRITE_OPERATIONS,
  read: READ_OPERATIONS,
}

// Check if a role allows a specific operation (no DB query, pure logic)
export function checkRolePermission(
  role: string,
  operation: string
): { allowed: boolean; reason?: string } {
  const allowedOperations = ROLE_PERMISSIONS[role] || []

  if (!allowedOperations.includes(operation)) {
    return {
      allowed: false,
      reason: `Role '${role}' not permitted to perform '${operation}'`,
    }
  }

  return { allowed: true }
}

/**
 * Workflow access verification is a no-op after the workflow canvas was
 * removed. Retained as a stub so existing callers and tests keep working;
 * always returns hasAccess=false so the caller falls back to their
 * error-handling path instead of proceeding with a stale workflow scope.
 */
export async function verifyWorkflowAccess(
  _userId: string,
  _workflowId: string
): Promise<{ hasAccess: boolean; role?: string; workspaceId?: string }> {
  return { hasAccess: false }
}

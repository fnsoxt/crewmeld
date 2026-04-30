/**
 * Workflow registry type stubs — the workflow registry (canvas editor) has been
 * removed from CrewMeld. Types are retained for the logs and query layers that
 * reference them for data-shape compatibility.
 */

/** Deployment lifecycle status for a workflow version. */
export type DeploymentStatus = 'deployed' | 'deploying' | 'failed' | 'undeployed'

/** Minimal workflow metadata stored in the registry. */
export interface WorkflowMetadata {
  id: string
  name: string
  description?: string
  color?: string
  workspaceId?: string
  folderId?: string | null
  marketplaceId?: string | null
  deploymentStatus?: DeploymentStatus
  lastSavedAt?: string
  isDeployed?: boolean
  runCount?: number
  lastRunAt?: string | null
  /** Display order within a folder or workspace. */
  sortOrder?: number
  /** ISO timestamp when workflow was created. */
  createdAt?: Date | string | null
  /** ISO timestamp of last modification. */
  lastModified?: Date | string | null
}

/**
 * Workflow registry store stub — the workflow canvas editor has been removed.
 * A minimal Zustand store is provided so the query layer and socket provider
 * compile and run without errors.
 */

import { create } from 'zustand'
import type { DeploymentStatus, WorkflowMetadata } from './types'

export interface WorkflowRegistryState {
  workflows: Record<string, WorkflowMetadata>
  activeWorkflowId: string | null
  isLoading: boolean
  error: string | null

  /** Called when a metadata load begins for a workspace. */
  beginMetadataLoad: (workspaceId: string) => void
  /** Called when metadata loads successfully. */
  completeMetadataLoad: (workspaceId: string, workflows: WorkflowMetadata[]) => void
  /** Called when a metadata load fails. */
  failMetadataLoad: (workspaceId: string, error: string) => void
  /** Updates the deployment status of a specific workflow. */
  setDeploymentStatus: (
    workflowId: string,
    status: DeploymentStatus | boolean,
    deployedAt?: Date,
    apiKey?: string
  ) => void
  /** Marks a workflow as needing redeployment. */
  setWorkflowNeedsRedeployment: (workflowId: string, needsRedeployment: boolean) => void
  /** Adds or updates a workflow metadata entry. */
  addWorkflow: (workflow: WorkflowMetadata) => void
}

export const useWorkflowRegistry = create<WorkflowRegistryState>()((set) => ({
  workflows: {},
  activeWorkflowId: null,
  isLoading: false,
  error: null,

  beginMetadataLoad: (_workspaceId) => set({ isLoading: true, error: null }),

  completeMetadataLoad: (_workspaceId, workflows) =>
    set({
      isLoading: false,
      workflows: Object.fromEntries(workflows.map((w) => [w.id, w])),
    }),

  failMetadataLoad: (_workspaceId, error) => set({ isLoading: false, error }),

  setDeploymentStatus: (workflowId, status, _deployedAt?, _apiKey?) => {
    const isDeployed = typeof status === 'boolean' ? status : status === 'deployed'
    const deploymentStatus: DeploymentStatus =
      typeof status === 'boolean' ? (status ? 'deployed' : 'undeployed') : status
    set((state) => ({
      workflows: {
        ...state.workflows,
        [workflowId]: state.workflows[workflowId]
          ? { ...state.workflows[workflowId], deploymentStatus, isDeployed }
          : state.workflows[workflowId],
      },
    }))
  },

  setWorkflowNeedsRedeployment: (_workflowId, _needsRedeployment) => {},

  addWorkflow: (workflow) =>
    set((state) => ({
      workflows: { ...state.workflows, [workflow.id]: workflow },
    })),
}))

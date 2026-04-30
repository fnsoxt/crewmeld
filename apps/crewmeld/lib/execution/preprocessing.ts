/**
 * Execution preprocessing stub — validates preconditions before a workflow
 * execution starts (rate limits, deployment checks, etc.).
 */

export interface PreprocessParams {
  workflowId: string
  userId: string
  triggerType: string
  executionId?: string
  requestId?: string
  checkRateLimit?: boolean
  checkDeployment?: boolean
  loggingSession?: unknown
}

export interface PreprocessError {
  message: string
  statusCode?: number
}

export interface PreprocessResult {
  success: boolean
  error?: PreprocessError
  code?: string
  rateLimited?: boolean
  deploymentMissing?: boolean
  /** Resolved actor user ID (may differ from the request userId in some flows). */
  actorUserId?: string
  /** Resolved workflow record with workspace metadata. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workflowRecord?: any
  /** Timeout configuration for the execution. */
  executionTimeout?: {
    async?: number
    sync?: number
  }
  /** Resolved variables for the execution. */
  variables?: Record<string, string>
}

/**
 * Validates preconditions before a workflow execution starts.
 * Returns a success result — full validation will be wired in P1.
 */
export async function preprocessExecution(_params: PreprocessParams): Promise<PreprocessResult> {
  return { success: true }
}

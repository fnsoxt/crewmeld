/**
 * Tool and function-call types for CrewMeld provider adapters.
 */

/** Controls whether the model is required, permitted, or forbidden to call tools. */
export type ToolUsageControl = 'auto' | 'force' | 'none'

/** Defines a single tool exposed to the model during a completion. */
export interface ProviderToolConfig {
  id: string
  name: string
  description: string
  params: Record<string, any>
  parameters: {
    type: string
    properties: Record<string, any>
    required: string[]
  }
  usageControl?: ToolUsageControl
  /** Optional transformer normalising SubBlock param values before tool invocation. */
  paramsTransform?: (params: Record<string, any>) => Record<string, any>
}

/** Full lifecycle record for one function/tool invocation within a completion turn. */
export interface FunctionCallResponse {
  name: string
  arguments: Record<string, any>
  startTime?: string
  endTime?: string
  duration?: number
  result?: Record<string, any>
  output?: Record<string, any>
  input?: Record<string, any>
  success?: boolean
}

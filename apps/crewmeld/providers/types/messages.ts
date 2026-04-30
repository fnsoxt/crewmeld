/**
 * Chat message types for OpenAI-compatible multi-turn conversation APIs.
 */

/** Identifies a function tool call embedded in an assistant turn. */
export interface FunctionCall {
  name: string
  arguments: string
}

/** Single tool-call entry within an assistant message's {@link Message.tool_calls} array. */
export interface AssistantToolCall {
  id: string
  type: 'function'
  function: FunctionCall
}

/**
 * A single message in an OpenAI-compatible conversation.
 * Provider adapters translate this canonical shape into their vendor-specific
 * wire format before dispatch.
 */
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool'
  content: string | null
  name?: string
  function_call?: FunctionCall
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  tool_call_id?: string
}

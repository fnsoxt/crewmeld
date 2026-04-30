export const CUSTOM_TOOL_PREFIX = 'custom_'

export function isCustomTool(toolId: string): boolean {
  return typeof toolId === 'string' && toolId.startsWith(CUSTOM_TOOL_PREFIX)
}

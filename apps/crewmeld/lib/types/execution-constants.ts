/**
 * Execution constants — relocated from executor/constants.ts stub.
 * These are shared across providers, uploads, logs, and stores.
 *
 * The DAG executor has been removed from CrewMeld. These constants are
 * retained for cross-layer compatibility.
 */

export const TRIGGER_INTERNAL_KEYS = ['webhook', 'workflowId'] as const
export type TriggerInternalKey = (typeof TRIGGER_INTERNAL_KEYS)[number]

export function isTriggerInternalKey(key: string): key is TriggerInternalKey {
  return (TRIGGER_INTERNAL_KEYS as readonly string[]).includes(key)
}

export enum BlockType {
  Agent = 'agent',
  Function = 'function',
  Api = 'api',
  Condition = 'condition',
  Starter = 'starter',
  Router = 'router',
}

export const TRIGGER_BLOCK_TYPES: string[] = []
export const METADATA_ONLY_BLOCK_TYPES: string[] = []
export const RESERVED_BLOCK_NAMES: string[] = []
export const SPECIAL_REFERENCE_PREFIXES: string[] = []

export type SentinelType = 'start' | 'end'

export const EDGE = { SENTINEL_START: 'start', SENTINEL_END: 'end' } as const
export const LOOP = { SENTINEL: 'loop' } as const
export const PARALLEL = { SENTINEL: 'parallel' } as const
export const REFERENCE = { SENTINEL: 'ref' } as const
export const LOOP_REFERENCE = { SENTINEL: 'loop-ref' } as const
export const PARALLEL_REFERENCE = { SENTINEL: 'parallel-ref' } as const

export const AGENT = {
  DEFAULT_MODEL: 'claude-sonnet-4-5',
  CUSTOM_TOOL_PREFIX: 'custom_',
} as const

export function isCustomTool(toolId: string): boolean {
  return typeof toolId === 'string' && toolId.startsWith('custom_')
}

export function isMcpTool(toolId: string): boolean {
  return typeof toolId === 'string' && toolId.startsWith('mcp:')
}

export const PATTERNS = {
  UUID: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
  UUID_V4: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  UUID_PREFIX: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  ENV_VAR_NAME: /^[A-Za-z_][A-Za-z0-9_]*$/,
} as const

export function isUuid(value: string): boolean {
  return PATTERNS.UUID.test(value)
}

export function isUuidV4(value: string): boolean {
  return PATTERNS.UUID_V4.test(value)
}

export function startsWithUuid(value: string): boolean {
  return PATTERNS.UUID_PREFIX.test(value)
}

export function isValidEnvVarName(name: string): boolean {
  return PATTERNS.ENV_VAR_NAME.test(name)
}

export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.-]/g, '_')
}

/** Returns true when the block type is a workflow-level control block. */
export function isWorkflowBlockType(_blockType: string): boolean {
  return false
}

/** Strips the custom-tool prefix (e.g. "custom_") from a tool ID. */
export function stripCustomToolPrefix(toolId: string): string {
  return toolId.startsWith(AGENT.CUSTOM_TOOL_PREFIX)
    ? toolId.slice(AGENT.CUSTOM_TOOL_PREFIX.length)
    : toolId
}

/**
 * Normalizes a display name by converting to lowercase and replacing
 * spaces/special characters with underscores.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

/** OAuth credential type identifier constant. */
export const CREDENTIAL = {
  TYPE: 'credential',
  /** Label used when a credential belongs to a foreign workspace. */
  FOREIGN_LABEL: 'Foreign credential',
} as const

/** OAuth credential set type identifier constant. */
export const CREDENTIAL_SET = {
  TYPE: 'credential_set',
  /** Prefix used on credential-set IDs passed via the UI. */
  PREFIX: 'credential_set:',
} as const

/**
 * Block type definitions — relocated from blocks/types.ts stub.
 * These are shared across providers, stores, and search.
 *
 * The block canvas system has been removed from CrewMeld in favour of the
 * SOP engine. These types are retained for data-shape compatibility.
 */

export type ParamType = 'string' | 'number' | 'boolean' | 'json' | 'array'
export type BlockCategory = 'blocks' | 'tools' | 'triggers'
export type SubBlockType = string
export type GenerationType = 'text' | 'code' | 'image'

export enum AuthMode {
  None = 'none',
  OAuth = 'oauth',
  ApiKey = 'apiKey',
}

export interface SubBlockConfig {
  id: string
  type: SubBlockType
  title?: string
  placeholder?: string
  password?: boolean
  condition?: unknown
  value?: unknown
  serviceId?: string
  requiredScopes?: string[]
  mimeType?: string
  columns?: unknown
  min?: number
  max?: number
  step?: number
  integer?: boolean
  language?: string
  generationType?: GenerationType
  acceptedTypes?: string | string[]
  multiple?: boolean
  maxSize?: number
  dependsOn?: unknown
  canonicalParamId?: string
  mode?: string
  wandConfig?: unknown
  options?: unknown[]
  password_?: boolean
  [key: string]: unknown
}

export interface BlockConfig {
  type: string
  name: string
  description?: string
  category?: BlockCategory
  subBlocks?: SubBlockConfig[]
  tools?: { access?: string[] }
  /** Trigger mode for trigger-type blocks. */
  triggerMode?: string
  /** Trigger configuration for blocks that support triggers. */
  triggers?: {
    enabled?: boolean
    available?: string[]
    [key: string]: unknown
  }
  /** Whether to hide this block from the toolbar/search. */
  hideFromToolbar?: boolean
  /** Background color for the block icon. */
  bgColor?: string
  /** Icon component or string identifier. */
  icon?: unknown
  /** Link to documentation for this block. */
  docsLink?: string
  [key: string]: unknown
}

export const SELECTOR_TYPES_HYDRATION_REQUIRED: SubBlockType[] = []

export type ExtractToolOutput<T> = T extends { output: infer O } ? O : never
export type ToolOutputToValueType<T> = T

// ---------------------------------------------------------------------------
// Block registry stub
// ---------------------------------------------------------------------------

export const registry: Record<string, unknown> = {}

export function getAllBlocks(): BlockConfig[] {
  return []
}

export function getAllBlockTypes(): string[] {
  return []
}

export function getBlock(_type: string): BlockConfig | null {
  return null
}

/** Alias used by some import paths. */
export const getLatestBlock = getBlock

export function getBlockByToolName(_toolName: string): BlockConfig | null {
  return null
}

export function getBlocksByCategory(_category: string): unknown[] {
  return []
}

export function isValidBlockType(_type: string): boolean {
  return false
}

// ---------------------------------------------------------------------------
// Canonical sub-block visibility stubs (relocated from lib/workflows/subblocks/visibility)
// ---------------------------------------------------------------------------

export type CanonicalMode = 'basic' | 'advanced'

export interface CanonicalGroup {
  id: string
  /** Canonical group ID (alias for id, used in scoped keys). */
  canonicalId?: string
  basic?: string[]
  advanced?: string[]
  /** Single basic-mode sub-block ID (legacy singular form). */
  basicId?: string
  /** IDs of basic-mode sub-blocks. */
  basicIds?: string[]
  /** IDs of advanced-mode sub-blocks. */
  advancedIds?: string[]
}

export interface CanonicalIndex {
  groups: CanonicalGroup[]
  byId: Record<string, CanonicalGroup>
  /** Maps sub-block ID → canonical group ID. */
  canonicalIdBySubBlockId: Record<string, string>
  /** Maps canonical group ID → CanonicalGroup. */
  groupsById: Record<string, CanonicalGroup>
}

export interface SubBlockCondition {
  field: string
  value?: unknown
}

export interface CanonicalModeOverrides {
  [groupId: string]: CanonicalMode
}

export interface CanonicalValueSelection {
  [fieldId: string]: unknown
}

export function buildSubBlockValues(
  _subBlocks: SubBlockConfig[],
  _values: Record<string, unknown>
): Record<string, unknown> {
  return {}
}

export function buildCanonicalIndex(_subBlocks: SubBlockConfig[]): CanonicalIndex {
  return { groups: [], byId: {}, canonicalIdBySubBlockId: {}, groupsById: {} }
}

export function isCanonicalPair(_group?: CanonicalGroup): boolean {
  return false
}

export function resolveCanonicalMode(
  _group: CanonicalGroup,
  _values: Record<string, unknown>,
  _overrides?: CanonicalModeOverrides
): CanonicalMode {
  return 'basic'
}

export function evaluateSubBlockCondition(
  _condition: SubBlockCondition | undefined,
  _values: Record<string, unknown>
): boolean {
  return true
}

export function isNonEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false
  if (Array.isArray(value) && value.length === 0) return false
  return true
}

export function getCanonicalValues(
  _group: CanonicalGroup,
  values: Record<string, unknown>
): Record<string, unknown> {
  return values
}

export function hasStandaloneAdvancedFields(_subBlocks: SubBlockConfig[]): boolean {
  return false
}

export function hasAdvancedValues(
  _subBlocks: SubBlockConfig[],
  _values: Record<string, unknown>
): boolean {
  return false
}

// ---------------------------------------------------------------------------
// Sub-block merge utility (relocated from lib/workflows/subblocks/merge)
// ---------------------------------------------------------------------------

/**
 * Merges base sub-block definitions with override values.
 * Override values take precedence over the stored defaults.
 */
export function mergeSubBlockValues(
  subBlocks: Record<string, unknown>,
  overrides?: Record<string, unknown>
): Record<string, unknown> {
  if (!overrides) return subBlocks
  const result: Record<string, unknown> = { ...subBlocks }
  for (const [key, value] of Object.entries(overrides)) {
    if (key in result && typeof result[key] === 'object' && result[key] !== null) {
      result[key] = { ...(result[key] as Record<string, unknown>), value }
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Trigger sidebar stubs (relocated from lib/workflows/triggers/trigger-utils)
// ---------------------------------------------------------------------------

export interface TriggerSidebarItem {
  id: string
  name: string
  description?: string
  icon?: string
  bgColor?: string
  type: string
}

/** Returns available trigger items for the sidebar. Always empty in CrewMeld. */
export function getTriggersForSidebar(): TriggerSidebarItem[] {
  return []
}

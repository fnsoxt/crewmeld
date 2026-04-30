/**
 * Tool parameter merge utilities.
 * Migrated from tools/params.ts (deleted in stage1.2).
 * Used by providers/utils/execution.ts to merge LLM-generated params with
 * user-configured block params before dispatching tool calls.
 */

// ---------------------------------------------------------------------------
// Tag helpers (inlined from deleted tools/shared/tags.ts)
// ---------------------------------------------------------------------------

/**
 * Checks if a single tag entry is effectively empty (unfilled/default).
 */
function isEmptyTagEntry(entry: Record<string, unknown>): boolean {
  if (!entry.tagName || (typeof entry.tagName === 'string' && entry.tagName.trim() === '')) {
    return true
  }
  return false
}

/**
 * Checks if a tag-based value is effectively empty (only contains default/unfilled entries).
 */
export function isEmptyTagValue(value: unknown): boolean {
  if (!value) return true

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (!Array.isArray(parsed)) return false
      if (parsed.length === 0) return true
      return parsed.every((entry: Record<string, unknown>) => isEmptyTagEntry(entry))
    } catch {
      return false
    }
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return true
    return value.every((entry: Record<string, unknown>) => isEmptyTagEntry(entry))
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
    if (entries.length === 0) return true
    return entries.every(([, val]) => val === undefined || val === null || val === '')
  }

  return false
}

// ---------------------------------------------------------------------------
// Non-empty check
// ---------------------------------------------------------------------------

/**
 * Returns true when a value is not undefined, null, or empty string.
 */
export function isNonEmpty(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ''
}

// ---------------------------------------------------------------------------
// inputMapping deep-merge
// ---------------------------------------------------------------------------

/**
 * Deep merges inputMapping objects, where LLM values fill in empty/missing user values.
 * User-provided non-empty values take precedence.
 */
export function deepMergeInputMapping(
  llmInputMapping: Record<string, unknown> | undefined,
  userInputMapping: Record<string, unknown> | string | undefined
): Record<string, unknown> {
  // Parse user inputMapping if it's a JSON string
  let parsedUserMapping: Record<string, unknown> = {}
  if (typeof userInputMapping === 'string') {
    try {
      const parsed = JSON.parse(userInputMapping)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        parsedUserMapping = parsed
      }
    } catch {
      // Invalid JSON — treat as empty
    }
  } else if (
    typeof userInputMapping === 'object' &&
    userInputMapping !== null &&
    !Array.isArray(userInputMapping)
  ) {
    parsedUserMapping = userInputMapping
  }

  // If no LLM mapping, return user mapping (or empty)
  if (!llmInputMapping || typeof llmInputMapping !== 'object') {
    return parsedUserMapping
  }

  // Deep merge: LLM values as base, user non-empty values override
  const merged: Record<string, unknown> = { ...llmInputMapping }

  for (const [key, userValue] of Object.entries(parsedUserMapping)) {
    if (isNonEmpty(userValue)) {
      merged[key] = userValue
    }
  }

  return merged
}

// ---------------------------------------------------------------------------
// Public API: mergeToolParameters
// ---------------------------------------------------------------------------

/**
 * Merges user-provided parameters with LLM-generated parameters.
 * User-provided parameters take precedence, but empty strings are skipped
 * so that LLM-generated values are used when user clears a field.
 *
 * Special handling for inputMapping: deep merges so LLM can fill in
 * fields that the user left empty in the UI.
 */
export function mergeToolParameters(
  userProvidedParams: Record<string, unknown>,
  llmGeneratedParams: Record<string, unknown>
): Record<string, unknown> {
  // Filter out empty and effectively-empty values from user-provided params
  const filteredUserParams: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(userProvidedParams)) {
    if (isNonEmpty(value)) {
      // Skip tag-based params if they're effectively empty
      if ((key === 'documentTags' || key === 'tagFilters') && isEmptyTagValue(value)) {
        continue
      }
      filteredUserParams[key] = value
    }
  }

  // Start with LLM params as base
  const result: Record<string, unknown> = { ...llmGeneratedParams }

  // Apply user params, with special handling for inputMapping
  for (const [key, userValue] of Object.entries(filteredUserParams)) {
    if (key === 'inputMapping') {
      const llmInputMapping = llmGeneratedParams.inputMapping as Record<string, unknown> | undefined
      result.inputMapping = deepMergeInputMapping(
        llmInputMapping,
        userValue as Record<string, unknown> | string | undefined
      )
    } else {
      result[key] = userValue
    }
  }

  // If LLM provided inputMapping but user didn't, ensure it's included
  if (llmGeneratedParams.inputMapping && !filteredUserParams.inputMapping) {
    result.inputMapping = llmGeneratedParams.inputMapping
  }

  return result
}

// ---------------------------------------------------------------------------
// Public API: createLLMToolSchema
// ---------------------------------------------------------------------------

/** Minimal JSON-schema shape expected by provider adapters. */
export interface ToolSchema {
  type: 'object'
  properties: Record<string, unknown>
  required: string[]
}

/**
 * Builds a JSON schema suitable for LLM tool declarations from a tool config.
 *
 * In crewmeld there is no built-in tool registry — tools are custom Skills
 * with arbitrary parameter shapes. This function returns a permissive object
 * schema when the tool config carries no explicit parameter definitions, or
 * passes through a pre-built schema when one is provided via toolConfig.schema.
 */
export async function createLLMToolSchema(
  toolConfig: {
    id?: string
    params?: Record<string, unknown>
    schema?: ToolSchema
  },
  _userProvidedParams: Record<string, unknown>
): Promise<ToolSchema> {
  // If the tool config already ships a pre-built JSON schema, use it directly.
  if (toolConfig.schema) {
    return toolConfig.schema
  }

  // Build a minimal schema from toolConfig.params entries if present.
  const schema: ToolSchema = { type: 'object', properties: {}, required: [] }

  if (toolConfig.params && typeof toolConfig.params === 'object') {
    for (const [key, paramDef] of Object.entries(toolConfig.params)) {
      if (typeof paramDef === 'object' && paramDef !== null) {
        const def = paramDef as Record<string, unknown>
        const propSchema: Record<string, unknown> = {
          type: def.type ?? 'string',
        }
        if (def.description) propSchema.description = def.description
        schema.properties[key] = propSchema
        if (def.required === true) schema.required.push(key)
      } else {
        schema.properties[key] = { type: 'string' }
      }
    }
  }

  return schema
}

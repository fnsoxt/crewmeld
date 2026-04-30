/**
 * Triggers index stub — the workflow trigger system has been removed from
 * CrewMeld. Minimal exports are provided so the background execution layer
 * and webhook handler compile without errors.
 */

export * from './constants'

/** Trigger event payload. */
export interface TriggerPayload {
  type: string
  workflowId?: string
  data?: Record<string, unknown>
  timestamp?: string
}

/** Returns a canonical trigger event object from raw input. */
export function buildTriggerPayload(type: string, data?: Record<string, unknown>): TriggerPayload {
  return { type, data, timestamp: new Date().toISOString() }
}

/** Trigger definition as stored in the registry. */
export interface TriggerDefinition {
  id: string
  type: string
  provider?: string
  name?: string
  bgColor?: string
  /** Output schema keyed by output name. */
  outputs?: Record<string, { type: string; [key: string]: unknown }>
}

/** Returns all registered trigger definitions. Always empty in CrewMeld. */
export function getAllTriggers(): TriggerDefinition[] {
  return []
}

/** Looks up a trigger definition by its type identifier. */
export function getTrigger(_type: string): TriggerDefinition {
  return { id: _type, type: _type }
}

/** Returns true when the trigger id/type is a known valid trigger. */
export function isTriggerValid(_type: string): boolean {
  return true
}

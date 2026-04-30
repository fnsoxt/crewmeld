/**
 * Trigger constants stub — the workflow trigger system has been removed from
 * CrewMeld. Minimal constants are exported so the background execution layer
 * compiles without errors.
 */

/** Known trigger type identifiers. */
export const TRIGGER_TYPES = {
  WEBHOOK: 'webhook',
  SCHEDULE: 'schedule',
  MANUAL: 'manual',
  API: 'api',
  CHAT: 'chat',
} as const

export type TriggerType = (typeof TRIGGER_TYPES)[keyof typeof TRIGGER_TYPES]

/** Returns true when the value is a known trigger type. */
export function isTriggerType(value: string): value is TriggerType {
  return Object.values(TRIGGER_TYPES).includes(value as TriggerType)
}

/** Maximum consecutive schedule execution failures before the schedule is disabled. */
export const MAX_CONSECUTIVE_FAILURES = 5

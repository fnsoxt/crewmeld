import type { HealthMessageI18n } from '@crewmeld/db/schema'
import type { TranslationKey } from '@/hooks/use-translation'

type TranslateFn = (key: TranslationKey, vars?: Record<string, string | number>) => string

/**
 * Render a stored {key, params} pair as a localized string using the current
 * translation function. Key is looked up under `connHealth.{key}`.
 *
 * Returns null when the input is nullish so callers can use conditional rendering.
 */
export function renderHealthMessage(
  i18n: HealthMessageI18n | null | undefined,
  t: TranslateFn
): string | null {
  if (!i18n || !i18n.key) return null
  const fullKey = `connHealth.${i18n.key}` as TranslationKey
  return t(fullKey, i18n.params)
}

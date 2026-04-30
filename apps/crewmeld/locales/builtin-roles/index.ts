/**
 * Built-in role display-field translation overlays, keyed by locale.
 *
 * English is the source language (lives directly in the JSON files
 * under `data/builtin-roles/`), so this module only exports overlays
 * for non-default locales (currently zh-CN).
 */

import type { Locale } from '@/locales'
import type { BuiltinRoleTranslation } from './en'
import { zh } from './zh'

export type { BuiltinRoleTranslation }

const builtinRoleTranslations: Partial<Record<Locale, Record<string, BuiltinRoleTranslation>>> = {
  'zh-CN': zh,
}

/**
 * Returns the display-field overlay for a given locale.
 * Returns `undefined` for English (the source locale) — callers should
 * fall back to the original JSON values in that case.
 */
export function getBuiltinRoleTranslations(
  locale: Locale
): Record<string, BuiltinRoleTranslation> | undefined {
  return builtinRoleTranslations[locale]
}

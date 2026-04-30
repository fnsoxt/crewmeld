import { useCallback, useContext } from 'react'
import { type Messages, messages } from '@/locales'
import { LocaleOverrideContext } from '@/stores/locale/locale-override'
import { useLocaleStore } from '@/stores/locale/store'

// ── Type-safe nested key derivation ──

type NestedKeyOf<T, Prefix extends string = ''> = T extends Record<string, unknown>
  ? {
      [K in keyof T & string]: T[K] extends Record<string, unknown>
        ? NestedKeyOf<T[K], Prefix extends '' ? K : `${Prefix}.${K}`>
        : Prefix extends ''
          ? K
          : `${Prefix}.${K}`
    }[keyof T & string]
  : never

/** All valid translation keys, e.g. 'nav.dashboard' | 'common.confirm' | ... */
export type TranslationKey = NestedKeyOf<Messages>

// ── Helpers ──

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const result = path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
  return typeof result === 'string' ? result : path
}

// ── Hook ──

/**
 * Returns a type-safe translation function `t` and the current `locale`.
 *
 * @example
 * ```tsx
 * const { t, locale } = useTranslation()
 * <h1>{t('nav.dashboard')}</h1>
 * <p>{t('employees.deleteWarning', { name: employee.name })}</p>
 * ```
 */
export function useTranslation() {
  const storeLocale = useLocaleStore((s) => s.locale)
  const overrideLocale = useContext(LocaleOverrideContext)
  const locale = overrideLocale ?? storeLocale
  const m = messages[locale]

  const t = useCallback(
    // Parameter is typed as `TranslationKey | string` so the function can be
    // passed to child components that expect `(key: string) => string`.
    (key: TranslationKey | string, vars?: Record<string, string | number>): string => {
      let text = getNestedValue(m as unknown as Record<string, unknown>, key as string)
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
        }
      }
      return text
    },
    [m]
  )

  /**
   * Translate an API response body by its `message` key and optional `params`.
   * Returns '' when `message` is absent/empty (success responses without prompts).
   */
  const tMessage = useCallback(
    (
      resp: { message?: string; params?: Record<string, string | number> } | null | undefined
    ): string => {
      if (!resp || !resp.message) return ''
      return t(resp.message as TranslationKey, resp.params)
    },
    [t]
  )

  return { t, tMessage, locale } as const
}

import { enUS } from 'date-fns/locale/en-US'
import { zhCN } from 'date-fns/locale/zh-CN'
import { useLocaleStore } from '@/stores/locale/store'

const DATE_LOCALES = { 'zh-CN': zhCN, en: enUS } as const

/**
 * Returns the date-fns locale matching the current app locale.
 *
 * @example
 * ```tsx
 * const dateLocale = useDateLocale()
 * format(new Date(), 'PPP', { locale: dateLocale })
 * ```
 */
export function useDateLocale() {
  const locale = useLocaleStore((s) => s.locale)
  return DATE_LOCALES[locale]
}

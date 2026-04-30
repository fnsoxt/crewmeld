import { en } from './en'
import { zhCN } from './zh-CN'

/** All translation messages type — derived from the Chinese locale (source of truth) */
export type Messages = typeof zhCN

/** Recursive type: same key structure as T but all leaf values are `string` (for non-zh-CN locales) */
type DeepString<T> = T extends string ? string : { [K in keyof T]: DeepString<T[K]> }
export type LooseMessages = DeepString<typeof zhCN>

/** Supported locale identifiers */
export type Locale = 'zh-CN' | 'en'

/** Default locale */
export const DEFAULT_LOCALE: Locale = 'zh-CN'

/** All available locales */
export const LOCALES: Locale[] = ['zh-CN', 'en']

/** Locale → messages map */
export const messages: Record<Locale, LooseMessages> = {
  'zh-CN': zhCN,
  en,
}

// Re-export TranslationKey so files that import it from '@/locales' compile.
// The canonical definition lives in hooks/use-translation.ts.
export type { TranslationKey } from '@/hooks/use-translation'

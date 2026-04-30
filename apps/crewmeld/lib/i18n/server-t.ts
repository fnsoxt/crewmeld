import type { MessageKey, MessageParams } from '@/lib/api/message-keys'
import { type Locale, messages } from '@/locales'

/**
 * Server-side translation helper.
 *
 * Unlike the React hook in `hooks/use-translation.ts`, this is a plain function
 * callable from API routes. Use this when you need to render a user-facing
 * string at request time (e.g. when writing work logs or audit descriptions to
 * the database with the caller's current locale).
 *
 * @param key    MessageKey from the locale file (e.g. `api.skill.bindingCreated`)
 * @param params Optional `{name}`-style template params
 * @param locale Target locale; usually the result of `resolveLocale(request)`
 */
export function t(key: MessageKey, params: MessageParams | undefined, locale: Locale): string {
  const bag = messages[locale] as unknown as Record<string, unknown>
  const raw = getNestedValue(bag, key)
  if (typeof raw !== 'string') return key
  if (!params) return raw
  let out = raw
  for (const [k, v] of Object.entries(params)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
  }
  return out
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object' && k in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[k]
    }
    return undefined
  }, obj)
}

import type { NextRequest } from 'next/server'
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@/locales'

/**
 * Cookie key used by the frontend locale store to persist the chosen locale.
 * The `stores/locale/store.ts` writes this cookie on `setLocale`.
 */
const LOCALE_COOKIE = 'crewmeld-locale'

/**
 * Resolve the request locale on the server.
 *
 * Priority (first match wins):
 *   1. `X-Locale` request header
 *   2. `crewmeld-locale` cookie
 *   3. `Accept-Language` header prefix match
 *   4. {@link DEFAULT_LOCALE}
 *
 * Only values in {@link LOCALES} are accepted; anything else falls through.
 */
export function resolveLocale(request: Request | NextRequest): Locale {
  const headers = request.headers

  const headerLocale = headers.get('x-locale')
  if (headerLocale && isSupportedLocale(headerLocale)) {
    return headerLocale
  }

  const cookieLocale = readCookie(headers.get('cookie'), LOCALE_COOKIE)
  if (cookieLocale && isSupportedLocale(cookieLocale)) {
    return cookieLocale
  }

  const acceptLanguage = headers.get('accept-language')
  if (acceptLanguage) {
    for (const candidate of splitAcceptLanguage(acceptLanguage)) {
      const normalized = normalizeLocale(candidate)
      if (normalized && isSupportedLocale(normalized)) {
        return normalized
      }
    }
  }

  return DEFAULT_LOCALE
}

function isSupportedLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value)
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const k = part.slice(0, idx).trim()
    if (k === name) {
      return decodeURIComponent(part.slice(idx + 1).trim())
    }
  }
  return null
}

function splitAcceptLanguage(header: string): string[] {
  return header
    .split(',')
    .map((part) => part.split(';')[0].trim())
    .filter(Boolean)
}

function normalizeLocale(tag: string): Locale | null {
  if (!tag) return null
  const lower = tag.toLowerCase()
  if (lower === 'zh' || lower.startsWith('zh-')) return 'zh-CN'
  if (lower === 'en' || lower.startsWith('en-')) return 'en'
  return null
}

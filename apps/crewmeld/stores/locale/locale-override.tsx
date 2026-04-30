'use client'

import { createContext, type ReactNode, useEffect } from 'react'
import type { Locale } from '@/locales'

/**
 * In-render locale override.
 *
 * Lets a subtree render in a fixed locale without writing to the persisted
 * locale store, the `crewmeld-locale` cookie, or `localStorage`. Used by the
 * standalone approval page so the email-shared link renders in the SOP's
 * language without leaking that choice back into the operator's main-app
 * locale preference.
 *
 * `useTranslation` reads this context first and falls back to the store.
 */
export const LocaleOverrideContext = createContext<Locale | null>(null)

interface LocaleOverrideProviderProps {
  value: Locale
  children: ReactNode
}

export function LocaleOverrideProvider({ value, children }: LocaleOverrideProviderProps) {
  // Mirror the locale onto <html lang> while mounted so screen readers and
  // browser features see the right language. Restored on unmount — this is
  // the only side effect; nothing is persisted.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const previous = document.documentElement.lang
    document.documentElement.lang = value
    return () => {
      document.documentElement.lang = previous
    }
  }, [value])

  return <LocaleOverrideContext.Provider value={value}>{children}</LocaleOverrideContext.Provider>
}

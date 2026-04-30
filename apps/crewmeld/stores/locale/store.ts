import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Locale } from '@/locales'
import { DEFAULT_LOCALE } from '@/locales'

interface LocaleState {
  locale: Locale
  setLocale: (locale: Locale) => void
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      setLocale: (locale: Locale) => {
        set({ locale })
        if (typeof document !== 'undefined') {
          document.documentElement.lang = locale
          // Sync to cookie so server-side handlers can resolve the same locale
          // (see apps/crewmeld/lib/i18n/server-locale.ts)
          document.cookie = `crewmeld-locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
        }
      },
    }),
    {
      name: 'crewmeld-locale',
      onRehydrateStorage: () => (state) => {
        if (state && typeof document !== 'undefined') {
          document.documentElement.lang = state.locale
          document.cookie = `crewmeld-locale=${state.locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
        }
      },
    }
  )
)

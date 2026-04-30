/**
 * Theme synchronization utilities for managing theme across next-themes and database
 */

const THEME_KEY = 'crewmeld-theme'
let themeKeyMigrated = false

/**
 */
function migrateLegacyThemeKey() {

}

/**
 * Paths that are always forced to light mode regardless of user theme preference.
 * Must stay in sync with the list in app/_shell/providers/theme-provider.tsx.
 */
const FORCED_LIGHT_PREFIXES = [
  '/',
  '/login',
  '/signup',
  '/reset-password',
  '/terms',
  '/privacy',
  '/invite',
  '/verify',
  '/pending-approval',
  '/careers',

  '/chat',
  '/studio',
  '/resume',
  '/form',
  '/dashboard',
  '/employees',
  '/tasks',
  '/stats',
  '/roles',
  '/connections',
  '/knowledge',
  '/logs',
  '/settings',
  '/canvas',
  '/conversations',
  '/human-employees',
  '/approval',
  '/sops',
  '/channels',
  '/setup',
]

function isForcedLightPath(pathname: string): boolean {
  return FORCED_LIGHT_PREFIXES.some((prefix) =>
    prefix === '/' ? pathname === '/' : pathname.startsWith(prefix)
  )
}

/**
 * Updates the theme in next-themes by dispatching a storage event.
 * This works by updating localStorage and notifying next-themes of the change.
 * On pages that enforce light mode, dark theme is never applied to the DOM.
 * @param theme - The desired theme ('system', 'light', or 'dark')
 */
export function syncThemeToNextThemes(theme: 'system' | 'light' | 'dark') {
  if (typeof window === 'undefined') return

  migrateLegacyThemeKey()
  const oldValue = localStorage.getItem(THEME_KEY)
  localStorage.setItem(THEME_KEY, theme)

  window.dispatchEvent(
    new StorageEvent('storage', {
      key: THEME_KEY,
      newValue: theme,
      oldValue: oldValue,
      storageArea: localStorage,
      url: window.location.href,
    })
  )

  const root = document.documentElement

  // On forced-light pages, always apply light regardless of user preference
  if (isForcedLightPath(window.location.pathname)) {
    root.classList.remove('dark')
    root.classList.add('light')
    return
  }

  root.classList.remove('light', 'dark')

  if (theme === 'system') {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    root.classList.add(systemTheme)
  } else {
    root.classList.add(theme)
  }
}

/**
 * Gets the current theme from next-themes localStorage
 */
export function getThemeFromNextThemes(): 'system' | 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  migrateLegacyThemeKey()
  return (localStorage.getItem(THEME_KEY) as 'system' | 'light' | 'dark') || 'light'
}

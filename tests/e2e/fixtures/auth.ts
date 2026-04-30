/**
 * E2E auth helpers — sign seed users in via the login form so the browser
 * receives a real better-auth session cookie.
 */
import type { Page } from '@playwright/test'
import { SEED_USERS, type SeedRole } from './seed'

export type { SeedRole }
export { SEED_USERS }

/**
 * Signs the given seed user in and installs the resulting better-auth cookies
 * on the browser context. Uses the HTTP endpoint directly so the helper works
 * regardless of whether the global storage-state fixture has already signed
 * a different user in.
 */
export async function loginAs(page: Page, role: SeedRole): Promise<void> {
  const user = SEED_USERS[role]

  // Clear the super-admin cookies primed by storageState so the new session
  // fully replaces the old one.
  await page.context().clearCookies()

  const res = await page.request.post('/api/auth/sign-in/email', {
    data: {
      email: user.email,
      password: user.password,
    },
  })

  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`loginAs(${role}) failed: ${res.status()} ${body.slice(0, 200)}`)
  }

  // `page.request` shares the browser context's cookie jar, so the session
  // cookies are now visible to the page. Force a document reload so SSR sees
  // them — otherwise the next goto() may still re-use stale server state.
  await page.goto('/')
}

/**
 * Logs the current user out by calling better-auth's sign-out endpoint
 * (same origin cookies so no auth header is required).
 */
export async function logout(page: Page): Promise<void> {
  await page.request.post('/api/auth/sign-out').catch(() => {
    // Ignore — some states may not have an active session.
  })
}

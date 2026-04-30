/**
 * Playwright globalSetup — seeds the DB and primes per-role storage states.
 *
 * 1. Runs the packaged seed script (`packages/db/seed/e2e-seed.ts`) via bun
 *    subprocess so its `drizzle-orm` import resolves.
 * 2. Uses the Playwright request context to sign each seed user in once via
 *    better-auth's `/api/auth/sign-in/email`, then persists the resulting
 *    cookies to `tests/e2e/.auth/<role>.json`. Specs load the super-admin
 *    state by default via `projects[].use.storageState`, which avoids having
 *    every test repeat a browser login and shaves ~5s off each run.
 *
 * `SEED_USERS` duplicates the source-of-truth in
 * `packages/db/seed/e2e-seed.ts`; keep the two in sync.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { request } from '@playwright/test'

export const SEED_USERS = {
  superAdmin: {
    id: 'seed-user-super-admin',
    email: 'admin@crewmeld.local',
    password: 'Crewmeld@2026',
    name: 'Super Admin',
    role: 'super_admin' as const,
  },
  admin: {
    id: 'seed-user-admin',
    email: 'ops@crewmeld.local',
    password: 'Ops@2026',
    name: 'Ops Admin',
    role: 'admin' as const,
  },
  member: {
    id: 'seed-user-member',
    email: 'viewer@crewmeld.local',
    password: 'Viewer@2026',
    name: 'Viewer',
    role: 'member' as const,
  },
} as const

export type SeedRole = keyof typeof SEED_USERS

const REPO_ROOT = resolve(__dirname, '..', '..', '..')
export const AUTH_STATE_DIR = resolve(REPO_ROOT, 'tests', 'e2e', '.auth')
export function storageStatePath(role: SeedRole): string {
  return resolve(AUTH_STATE_DIR, `${role}.json`)
}

async function runSeedScript(): Promise<void> {
  const cwd = resolve(REPO_ROOT, 'packages', 'db')
  const script = 'seed/e2e-seed.ts'
  // eslint-disable-next-line no-console
  console.log('[e2e globalSetup] seeding via', cwd, script)

  execFileSync('bun', ['run', script], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env },
  })
}

async function primeStorageStates(baseURL: string): Promise<void> {
  mkdirSync(AUTH_STATE_DIR, { recursive: true })

  for (const role of Object.keys(SEED_USERS) as SeedRole[]) {
    const user = SEED_USERS[role]
    const ctx = await request.newContext({ baseURL })

    const res = await ctx.post('/api/auth/sign-in/email', {
      data: {
        email: user.email,
        password: user.password,
      },
    })

    if (!res.ok()) {
      const body = await res.text()
      throw new Error(
        `[e2e globalSetup] sign-in for ${role} failed: ${res.status()} ${body.slice(0, 200)}`
      )
    }

    await ctx.storageState({ path: storageStatePath(role) })
    await ctx.dispose()
    // eslint-disable-next-line no-console
    console.log(`[e2e globalSetup] primed storage state for ${role}`)
  }
}

/**
 * Playwright globalSetup entry point.
 */
export default async function globalSetup(): Promise<void> {
  await runSeedScript()
  await primeStorageStates('http://localhost:6100')
}

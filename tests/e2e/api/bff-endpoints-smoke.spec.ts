/**
 * BFF endpoint smoke tests — whitepaper §18.3 "接口可用性验证".
 *
 * Enumerates 30 GET-only, read-safe BFF endpoints and asserts each returns
 * an HTTP status < 500 when called with a valid super-admin session (primed
 * by globalSetup via `storageState`). A status >= 500 indicates a server-side
 * crash or unhandled exception; 4xx responses (e.g. 401, 403, 404) are
 * explicitly allowed — they represent correct application behaviour.
 *
 * Endpoints are drawn from the 161-route inventory at `temp/p5-bff-routes.txt`
 * (generated during Phase 0). Only non-parameterised paths are included, or
 * parameterised paths whose segment is a well-known seed fixture value that
 * is guaranteed to exist after `packages/db/seed/e2e-seed.ts` runs.
 *
 * RAGFlow-backed routes are excluded: those proxy to an external service that
 * will not be running in CI, so a 502/503 response is expected rather than a
 * 5xx caused by application code.
 *
 *  §18.3
 */
import { expect, test } from '../screenshot-fixture'

// ---------------------------------------------------------------------------
// Endpoint catalogue
// ---------------------------------------------------------------------------

/**
 * Representative subset of BFF GET endpoints that are:
 *   - read-only (GET verb)
 *   - non-parameterised or using seed-fixture IDs / well-known slugs
 *   - not dependent on an external service (ragflow, ollama, k8s)
 *
 * Each entry is a tuple `[label, path]` so the test title is descriptive.
 */
const SAFE_GET_ENDPOINTS: ReadonlyArray<[string, string]> = [
  // Auth & identity
  ['employee auth me', '/api/employee/auth/me'],
  ['employee auth permissions', '/api/employee/auth/permissions'],
  ['employee auth role', '/api/employee/auth/role'],
  ['user profile', '/api/users/me/profile'],
  ['user settings', '/api/users/me/settings'],
  ['user api-keys', '/api/users/me/api-keys'],

  // Health & system
  ['health probe', '/api/health'],
  ['readiness probe', '/api/ready'],
  ['system info', '/api/employee/settings/system-info'],
  ['system info health-check', '/api/employee/settings/system-info/health-check'],
  ['system setup status', '/api/system/setup/status'],

  // Core entity lists
  ['employees list', '/api/employee/employees'],
  ['human-employees list', '/api/employee/human-employees'],
  ['sops list', '/api/employee/sops'],
  ['scheduled-tasks list', '/api/employee/scheduled-tasks'],
  ['tasks list', '/api/employee/tasks'],
  ['tasks pending-count', '/api/employee/tasks/pending-count'],
  ['tasks pending-list', '/api/employee/tasks/pending-list'],
  ['conversations list', '/api/employee/conversations'],
  ['conversations history', '/api/employee/conversations/history'],

  // Knowledge & models
  ['models list', '/api/employee/models'],
  ['models discover-ollama', '/api/employee/models/discover-ollama'],

  // Connectors & channels
  ['connectors list', '/api/employee/connectors'],
  ['connectors config', '/api/employee/connectors/config'],
  ['channels list', '/api/employee/channels'],
  ['channels notification-bot', '/api/employee/channels/notification-bot'],

  // Skills & templates
  ['skills list', '/api/employee/skills'],
  ['skills instances list', '/api/employee/skills/instances'],
  ['skills bindings', '/api/employee/skills/bindings'],
  ['templates list', '/api/employee/templates'],
  ['settings templates', '/api/employee/settings/templates'],
  ['workshops list', '/api/employee/workshops'],

  // Users & roles
  ['users list', '/api/employee/users'],
  ['settings roles', '/api/employee/settings/roles'],
  ['settings registration', '/api/employee/settings/registration'],

  // Stats & logs
  ['stats overview', '/api/employee/stats/overview'],
  ['stats employees', '/api/employee/stats/employees'],
  ['stats cost', '/api/employee/stats/cost'],
  ['stats trends', '/api/employee/stats/trends'],
  ['stats report', '/api/employee/stats/report'],
  ['logs list', '/api/logs'],
  ['logs stats', '/api/logs/stats'],
  ['logs triggers', '/api/logs/triggers'],
  ['audit logs', '/api/audit/logs'],
  ['audit alerts', '/api/audit/alerts'],
  ['audit export', '/api/audit/export'],

  // Permission groups
  ['permission-groups list', '/api/permission-groups'],
  ['permission-groups user', '/api/permission-groups/user'],

  // Human-employees helpers
  ['human-employees contact-availability', '/api/employee/human-employees/contact-availability'],

  // Auth connections
  ['auth oauth connections', '/api/auth/oauth/connections'],
  ['auth registration settings', '/api/auth/registration/settings'],
  ['auth accounts', '/api/auth/accounts'],

  // Super-user utility
  ['super-user check', '/api/user/super-user'],

  // Top-level stats alias
  ['stats overview (top-level)', '/api/stats/overview'],
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('BFF endpoint smoke (whitepaper §18.3)', () => {
  for (const [label, path] of SAFE_GET_ENDPOINTS) {
    test(`GET ${path} → <500`, async ({ request }) => {
      const response = await request.get(path)
      // 4xx is acceptable (auth guard, not-found, etc.).  5xx = server crash.
      expect(
        response.status(),
        `${label} returned ${response.status()} — expected < 500`
      ).toBeLessThan(500)
    })
  }
})

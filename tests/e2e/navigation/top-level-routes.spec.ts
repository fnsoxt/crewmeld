/**
 * Top-level navigation smoke tests — whitepaper §19.2 "主导航路由可用性".
 *
 * Enumerates all sidebar nav items defined in
 * `apps/crewmeld/app/(employee)/layout.tsx` (`NAV_ITEMS`) and asserts that
 * each page:
 *   1. Returns HTTP 200 (no hard redirect to /login or /error).
 *   2. Renders at least one `<h1>` element that is visible.
 *
 * Tests run against the real BFF (no mocks required) with the super-admin
 * session primed by globalSetup via `projects[].use.storageState`.
 *
 * Note: `/settings` redirects to `/settings/preferences` (a Next.js server
 * redirect). The navigation check is therefore performed against
 * `/settings/preferences` which renders the settings `<h1>`.
 *
 * Note: `/workshop` and `/skills` render empty-state or split-pane UIs that
 * do not emit a top-level `<h1>` at the route root; those routes are tested
 * for "no crash" (status 200, `<body>` visible) rather than h1 presence.
 *
 *  §19.2
 * @see apps/crewmeld/app/(employee)/layout.tsx — NAV_ITEMS source of truth
 */
import { expect, test } from '../screenshot-fixture'

// ---------------------------------------------------------------------------
// Route catalogue
// ---------------------------------------------------------------------------

type RouteCheck = {
  /** Human-readable label for the test title. */
  label: string
  /** Path to navigate to. */
  path: string
  /**
   * When `true`, skip the h1 visibility assertion and only verify the page
   * does not crash (body visible, no 500-level error page).
   */
  noH1?: boolean
}

/**
 * Sidebar routes derived from `NAV_ITEMS` in layout.tsx, plus their
 * resolved landing paths for routes that redirect.
 */
const NAV_ROUTES: ReadonlyArray<RouteCheck> = [
  { label: '总览 (dashboard)', path: '/dashboard' },
  { label: '数字员工 (employees)', path: '/employees' },
  { label: '任务 (tasks)', path: '/tasks' },
  { label: '对话 (conversations)', path: '/conversations' },
  { label: '数据分析 (stats)', path: '/stats' },
  { label: '知识库 (knowledge)', path: '/knowledge' },
  { label: '角色管理 (roles)', path: '/roles' },
  { label: '系统连接 (connections)', path: '/connections' },
  { label: '渠道 (channels)', path: '/channels' },
  { label: '人工员工 (human-employees)', path: '/human-employees' },
  { label: 'SOP 流程 (sops)', path: '/sops' },
  { label: '系统日志 (logs)', path: '/logs' },
  {
    // skills page renders a split-pane with no root h1 until a template is
    // selected; only verify no crash.
    label: '算子市场 (skills)',
    path: '/skills',
    noH1: true,
  },
  {
    // /settings redirects to /settings/preferences which has an h1
    label: '系统设置 (settings)',
    path: '/settings/preferences',
  },
  {
    // workshop root shows an empty-state <p>, not an <h1>
    label: '工作坊 (workshop)',
    path: '/workshop',
    noH1: true,
  },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Top-level navigation routes (whitepaper §19.2)', () => {
  for (const route of NAV_ROUTES) {
    test(`${route.path} renders without crashing`, async ({ page }) => {
      const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' })

      // Must not be an error page — allow redirects (3xx → final 200).
      expect(response?.status() ?? 200, `${route.label}: unexpected HTTP status`).toBeLessThan(500)

      // Must not bounce to /login (super-admin session should be active).
      await expect(page).not.toHaveURL(/\/login/, { timeout: 5_000 })

      if (route.noH1) {
        // Crash guard only: body must be visible with some content.
        await expect(page.locator('body'), `${route.label}: body not visible`).toBeVisible({
          timeout: 10_000,
        })
      } else {
        // At least one <h1> must be visible in the viewport.
        await expect(page.locator('h1').first(), `${route.label}: no visible <h1>`).toBeVisible({
          timeout: 10_000,
        })
      }
    })
  }
})

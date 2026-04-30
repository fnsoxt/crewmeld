/**
 * E2E spec — /roles management page.
 *
 * Covers the roles management page at `/roles`, exercising the full lifecycle
 * of a custom role:
 *   1. Navigate to the roles list — page renders with h1 "角色管理".
 *   2. Click "新建角色" → NewRoleDialog opens → fill name + description →
 *      submit → new role card appears in the grid.
 *   3. Click the per-card delete button → confirm modal → role disappears.
 *
 * ### testid inventory
 *
 * Real testids present in source:
 *   - `role-list:add`                     — "新建角色" button (roles/page.tsx line 83)
 *   - `new-role-dialog:input:name`         — role name Input (new-role-dialog.tsx line 89)
 *   - `new-role-dialog:input:description`  — description textarea (new-role-dialog.tsx line 103)
 *   - `new-role-dialog:input:persona`      — persona textarea (new-role-dialog.tsx line 115)
 *   - `new-role-dialog:submit`             — submit button (new-role-dialog.tsx line 129)
 *   - `role-list:card:{id}`               — role card div (roles/page.tsx line 131)
 *   - `role-list:delete:{id}`             — delete icon button (roles/page.tsx line 156)
 *
 * Missing testids — Phase 2 safe fix:
 *   - Delete confirm modal buttons have no testids; tests fall back to
 *     role-based locator (`button[name=/确认删除/]`).
 *
 * @see whitepaper §企业AI数字员工平台 — 角色管理
 * @module tests/e2e/roles/roles-page
 */

import { expect, test } from '../screenshot-fixture'

/** Base URL for direct API cleanup calls. */
const BASE = 'http://localhost:6100'

/** Unique name prefix to avoid collisions across parallel test runs. */
const ROLE_NAME = `[e2e] test-role-${Date.now()}`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Delete a role by id via BFF REST API.
 * Errors are swallowed — cleanup must not fail a passing test.
 */
async function deleteRoleById(
  request: import('@playwright/test').APIRequestContext,
  id: string
): Promise<void> {
  try {
    await request.delete(`${BASE}/api/employee/roles/${id}`)
  } catch {
    // intentionally swallowed — cleanup path
  }
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

test.describe('Roles management page (/roles)', () => {
  /** Role id created during the test — cleaned up in afterEach. */
  let createdRoleId: string | null = null

  test.afterEach(async ({ request }) => {
    if (createdRoleId) {
      await deleteRoleById(request, createdRoleId)
      createdRoleId = null
    }
  })

  // -------------------------------------------------------------------------
  // Test 1: list view renders
  // -------------------------------------------------------------------------
  test('roles page renders with heading 角色管理', async ({ page }) => {
    await page.goto('/roles')
    await page.waitForLoadState('domcontentloaded')

    // h1 heading should contain the page title
    await expect(page.getByRole('heading', { level: 1, name: '角色管理' })).toBeVisible({
      timeout: 10_000,
    })

    // "新建角色" add button should be present (requires employee:create permission)
    await expect(page.getByTestId('role-list:add')).toBeVisible({ timeout: 8_000 })
  })

  // -------------------------------------------------------------------------
  // Test 2: create role via dialog
  // -------------------------------------------------------------------------
  test('create role via dialog → card appears in list', async ({ page, request }) => {
    await page.goto('/roles')
    await page.waitForLoadState('domcontentloaded')

    // Wait for the add button (confirms page is ready)
    const addBtn = page.getByTestId('role-list:add')
    await expect(addBtn).toBeVisible({ timeout: 10_000 })

    // Open the New Role dialog
    await addBtn.click()

    // Dialog should open — locate by role name input presence
    const nameInput = page.getByTestId('new-role-dialog:input:name')
    await expect(nameInput).toBeVisible({ timeout: 8_000 })

    // Fill role name (required)
    await nameInput.fill(ROLE_NAME)

    // Fill description (optional)
    const descInput = page.getByTestId('new-role-dialog:input:description')
    await expect(descInput).toBeVisible({ timeout: 5_000 })
    await descInput.fill('E2E test role — auto-created, will be deleted')

    // Submit
    const submitBtn = page.getByTestId('new-role-dialog:submit')
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 })
    await submitBtn.click()

    // Dialog should close (name input disappears)
    await expect(nameInput).not.toBeVisible({ timeout: 10_000 })

    // New role card should appear in the grid
    // Roles page uses `role-list:card:{id}` — locate by card text since we
    // don't yet know the id; once found we extract the id for cleanup.
    const card = page.locator('[data-testid^="role-list:card:"]').filter({ hasText: ROLE_NAME })
    await expect(card).toBeVisible({ timeout: 15_000 })

    // Extract the created id for afterEach cleanup (API fallback)
    const testId = await card.getAttribute('data-testid')
    if (testId) {
      createdRoleId = testId.replace('role-list:card:', '')
    }

    // Also fetch via API as a fallback in case the testid extraction fails
    if (!createdRoleId) {
      try {
        const listRes = await request.get(`${BASE}/api/employee/roles`)
        const body = (await listRes.json()) as {
          data?: Array<{ id: string; name: string }>
        }
        const found = body?.data?.find((r) => r.name === ROLE_NAME)
        if (found) {
          createdRoleId = found.id
        }
      } catch {
        // swallowed — cleanup already attempted via testid path
      }
    }
  })

  // -------------------------------------------------------------------------
  // Test 3: delete role via per-card delete button
  // -------------------------------------------------------------------------
  test('delete role via card delete button → card disappears', async ({ page, request }) => {
    // Pre-create a role via API so the test has something to delete
    let roleId: string | null = null
    try {
      const createRes = await request.post(`${BASE}/api/employee/roles`, {
        data: {
          name: `${ROLE_NAME}-del`,
          description: 'E2E delete test role — auto-created',
        },
      })
      const body = (await createRes.json()) as { data?: { id: string } }
      roleId = body?.data?.id ?? null
    } catch {
      // If pre-create fails the test will be a soft fail — no role card to delete
    }

    await page.goto('/roles')
    await page.waitForLoadState('domcontentloaded')

    if (!roleId) {
      // Cannot proceed without a known role — skip gracefully
      test.skip()
      return
    }

    // Wait for the role card to appear
    const card = page.getByTestId(`role-list:card:${roleId}`)
    await expect(card).toBeVisible({ timeout: 15_000 })

    // Click the per-card delete icon
    const deleteBtn = page.getByTestId(`role-list:delete:${roleId}`)
    await expect(deleteBtn).toBeVisible({ timeout: 8_000 })
    await deleteBtn.click()

    // Confirmation modal appears — locate confirm button by text
    // (modal buttons have no testid — Phase 2 safe fix)
    const confirmBtn = page.getByRole('button', { name: /确认删除/ })
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 })
    await confirmBtn.click()

    // Card should disappear after successful deletion
    await expect(card).not.toBeVisible({ timeout: 10_000 })

    // Clear id — deleted by test, no afterEach cleanup needed
    roleId = null
  })
})

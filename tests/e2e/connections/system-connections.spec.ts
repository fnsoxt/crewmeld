/**
 * E2E spec — whitepaper §16.1 System connections management.
 *
 * Covers the connections management page at `/connections`, exercising the
 * full lifecycle of a non-singleton system connection:
 *   1. Navigate to the connections list — page and tab switcher render.
 *   2. Open the Add Connection wizard for the `custom_api` type.
 *   3. Fill the connection name and API endpoint, save the connection.
 *   4. Assert the new connection card appears in the list.
 *   5. Delete the connection via the card action menu and confirm deletion.
 *
 * The `custom_api` type is chosen because it skips the "select type" step
 * when the tab is pre-selected and it requires no external service to be
 * reachable — the test flow exercises wizard → save → delete without a real
 * connectivity test.
 *
 * ### testid inventory
 *
 * Real testids present in source:
 *   - `connection-list:add:custom_api`  — Add Connection button
 *     (connections/page.tsx, pre-selected tab variant)
 *   - `custom-api:input:url`            — URL input in CustomApiEditor
 *   - `custom-api:send`                 — Send/test button (not used here)
 *
 * Missing testids — Phase 2 safe fix:
 *   - `connection-card:{id}`  — ConnectionCard outer div has no testid;
 *     test falls back to text-based locator for the card name.
 *   - `connection-card:menu:{id}`  — MoreVertical action menu button has no testid;
 *     test falls back to aria-role / text lookup within the card.
 *   - `connection-list:empty`  — empty-state container has no testid.
 *
 * @see whitepaper §16.1 — 系统连接管理
 * @module tests/e2e/connections/system-connections
 */

import { expect, test } from '../screenshot-fixture'

/** Base URL used for direct API calls in setup/teardown helpers. */
const BASE = 'http://localhost:6100'

/** Unique name prefix to avoid collisions with other test runs. */
const CONN_NAME = `[e2e] custom-api-${Date.now()}`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Delete a connection by id using the BFF REST API.
 * Errors are swallowed — cleanup must not fail a passing test.
 */
async function deleteConnectionById(
  request: import('@playwright/test').APIRequestContext,
  id: string
): Promise<void> {
  try {
    await request.delete(`${BASE}/api/employee/connectors/${id}`)
  } catch {
    // intentionally swallowed — cleanup path
  }
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

test.describe('System connections (whitepaper §16.1)', () => {
  /** Connection id created during the test — cleaned up in afterEach. */
  let createdConnectionId: string | null = null

  test.afterEach(async ({ request }) => {
    if (createdConnectionId) {
      await deleteConnectionById(request, createdConnectionId)
      createdConnectionId = null
    }
  })

  test('connections page loads, create connection, delete connection', async ({
    page,
    request,
  }) => {
    // ------------------------------------------------------------------
    // 1. Navigate to connections page
    // ------------------------------------------------------------------
    await page.goto('/connections')
    await page.waitForLoadState('domcontentloaded')

    // Page heading should be visible
    await expect(page.getByRole('heading').filter({ hasText: /连接|Connection/i })).toBeVisible({
      timeout: 10_000,
    })

    // Tab switcher should be visible (at least one tab button)
    const tabs = page.locator('[class*="border-b"] button')
    await expect(tabs.first()).toBeVisible({ timeout: 8_000 })

    // ------------------------------------------------------------------
    // 2. Switch to the custom_api tab
    // ------------------------------------------------------------------
    const customApiTab = page.getByRole('button', { name: /自定义|Custom API/i })
    await expect(customApiTab).toBeVisible({ timeout: 8_000 })
    await customApiTab.click()

    // ------------------------------------------------------------------
    // 3. Open the Add Connection wizard
    // ------------------------------------------------------------------
    // The add button has testid `connection-list:add:custom_api`
    const addBtn = page.getByTestId('connection-list:add:custom_api')
    await expect(addBtn).toBeVisible({ timeout: 8_000 })
    await addBtn.click()

    // Dialog should open
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 8_000 })

    // ------------------------------------------------------------------
    // 4. Fill connection name
    // ------------------------------------------------------------------
    // custom_api wizard skips the "select type" step and goes directly to the
    // config form. The name field is a labeled Input (no testid — Phase 2 fix).
    const nameInput = dialog.locator('input[maxlength="100"]').first()
    await nameInput.fill(CONN_NAME)

    // ------------------------------------------------------------------
    // 5. Fill API endpoint — `custom-api:input:url` testid is real
    // ------------------------------------------------------------------
    const urlInput = page.getByTestId('custom-api:input:url')
    await expect(urlInput).toBeVisible({ timeout: 8_000 })
    await urlInput.fill('https://httpbin.org/get')

    // ------------------------------------------------------------------
    // 6. Save the connection (custom_api skips the test step — save directly)
    // ------------------------------------------------------------------
    // The save button in the custom_api path is labelled by the i18n key
    // `connections.wizardSaveConnection`. Locate it by text pattern.
    const saveBtn = dialog.getByRole('button', { name: /保存|Save/i })
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
    await saveBtn.click()

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 10_000 })

    // ------------------------------------------------------------------
    // 7. Verify card appears in the list
    // ------------------------------------------------------------------
    // ConnectionCard has no data-testid — locate by the connection name text.
    // Phase 2 safe fix: add `data-testid="connection-card:{id}"` to ConnectionCard.
    const card = page.locator('[class*="rounded-xl"]').filter({ hasText: CONN_NAME })
    await expect(card).toBeVisible({ timeout: 15_000 })

    // Capture the newly-created connection id via API for cleanup fallback
    const listRes = await request.get(`${BASE}/api/employee/connectors?type=custom_api`)
    const listBody = (await listRes.json()) as {
      data?: { connections?: Array<{ id: string; name: string }> }
    }
    const found = listBody?.data?.connections?.find((c) => c.name === CONN_NAME)
    if (found) {
      createdConnectionId = found.id
    }

    // ------------------------------------------------------------------
    // 8. Delete the connection via the action menu
    // ------------------------------------------------------------------
    // The MoreVertical button has no testid — Phase 2 safe fix:
    // add `data-testid="connection-card:menu:{id}"`.
    // Locate it as the icon button within the card.
    const menuBtn = card
      .getByRole('button')
      .filter({ has: page.locator('svg') })
      .first()
    await menuBtn.click()

    // Delete option in the dropdown
    const deleteOption = page.getByRole('button', { name: /删除|Delete/i })
    await expect(deleteOption).toBeVisible({ timeout: 5_000 })
    await deleteOption.click()

    // Confirmation modal appears
    const confirmBtn = page.getByRole('button', { name: /确认删除|Confirm/i })
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 })
    await confirmBtn.click()

    // Card should disappear
    await expect(card).not.toBeVisible({ timeout: 10_000 })

    // Clear id — deleted by test; no afterEach cleanup needed
    createdConnectionId = null
  })
})

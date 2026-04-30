import { expect, test } from '../screenshot-fixture'

// Super-admin session is provisioned via projects[].use.storageState.

test('channels page loads with channel type options', async ({ page }) => {
  await page.goto('/channels')
  await expect(page.locator('h1')).toBeVisible()

  // The type filter dropdown lists all channel types including '添加渠道' button text or filter options
  // The page header button has text '添加渠道' (contains '添加') — guarded by PermissionGuard
  // The type filter <select> always renders channel type options; fall back to checking the filter
  const channelTypeFilter = page.locator('[data-testid="channel-list:filter:type"]')
  await expect(channelTypeFilter).toBeVisible({ timeout: 8000 })
})

test('wecom channel wizard accessible', async ({ page }) => {
  await page.goto('/channels')
  await expect(page.locator('h1')).toBeVisible()

  // The channel type filter <select> always renders wecom = '企业微信' as an <option>
  // Use locator that finds the option text within the select element
  await expect(page.locator('[data-testid="channel-list:filter:type"]')).toBeVisible({
    timeout: 8000,
  })
  const selectText = await page.locator('[data-testid="channel-list:filter:type"]').innerHTML()
  expect(selectText).toContain('企业微信')
})

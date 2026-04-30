import { expect, test } from '../screenshot-fixture'

// Super-admin session is provisioned via projects[].use.storageState.

test.describe('SOP Create and Navigate (Wave 3 smoke)', () => {
  test('sop list page renders and new-sop form is accessible', async ({ page }) => {
    // SOP list page — h1 is 'SOP 管理' (t('sops.title'))
    await page.goto('/sops')
    await expect(page.locator('h1')).toContainText('SOP')

    // Navigate directly to the new-SOP form (avoids PermissionGuard on list-page button)
    await page.goto('/sops/new')
    // The new-SOP form renders its own h1: '新建 SOP' (t('sops.newTitle'))
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.locator('[data-testid="sop-form:input:name"]')).toBeVisible()
  })
})

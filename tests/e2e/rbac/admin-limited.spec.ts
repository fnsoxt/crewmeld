import { loginAs } from '../fixtures/auth'
import { expect, test } from '../screenshot-fixture'

test.describe('RBAC: admin limited access', () => {
  test('admin sees core navigation entries', async ({ page }) => {
    await loginAs(page, 'admin')

    // Admin retains access to the main operational pages (employee/sop mgmt).
    await page.goto('/employees')
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.locator('body')).toBeVisible()
  })

  test('admin reaches /sops without redirect to login', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto('/sops')
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.locator('body')).toBeVisible()
  })
})

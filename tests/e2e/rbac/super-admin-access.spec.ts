import { loginAs } from '../fixtures/auth'
import { expect, test } from '../screenshot-fixture'

test.describe('RBAC: super_admin access', () => {
  test('super admin can reach dashboard after login', async ({ page }) => {
    await loginAs(page, 'superAdmin')
    await expect(page).toHaveURL(/\/(dashboard|employees|home)/)
    // Sidebar should render at least one known nav link.
    const firstLink = page.locator('a[href="/employees"], a[href="/dashboard"]').first()
    await expect(firstLink).toBeVisible({ timeout: 8000 })
  })

  test('super admin can access the new-employee page', async ({ page }) => {
    await loginAs(page, 'superAdmin')
    await page.goto('/employees/new')
    // Should NOT bounce back to /login.
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.locator('body')).toBeVisible()
  })
})

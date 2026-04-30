import { loginAs } from '../fixtures/auth'
import { expect, test } from '../screenshot-fixture'

test.describe('RBAC: member readonly', () => {
  test('member can log in and land on dashboard', async ({ page }) => {
    await loginAs(page, 'member')
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('member employees list hides the "new employee" action', async ({ page }) => {
    await loginAs(page, 'member')
    await page.goto('/employees')
    await expect(page.locator('body')).toBeVisible()

    // PermissionGuard should hide the create button for members. Match both
    // the Chinese button label and potential English fallback.
    const newEmployeeBtn = page.locator('button', {
      hasText: /新建员工|New employee|Create employee/i,
    })
    await expect(newEmployeeBtn).toHaveCount(0)
  })
})

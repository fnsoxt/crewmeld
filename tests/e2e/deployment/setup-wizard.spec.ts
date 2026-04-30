import { expect, test } from '../screenshot-fixture'
import { fetchSetupStatus } from './test-data'

test.describe('首次运行向导', () => {
  test('setup status API returns correct value', async ({ page }) => {
    await page.goto('/dashboard')

    const data = await fetchSetupStatus(page)
    expect(data).toHaveProperty('initialized')
    expect(typeof data.initialized).toBe('boolean')
  })

  test('/setup redirects to /dashboard when already initialized', async ({ page }) => {
    await page.goto('/dashboard')

    const data = await fetchSetupStatus(page)

    if (data.initialized) {
      await page.goto('/setup')
      await page.waitForURL(/dashboard/, { timeout: 10000 })
      expect(page.url()).toContain('/dashboard')
    }
  })

  test('/setup shows wizard when not initialized', async ({ page }) => {
    await page.goto('/dashboard')

    const data = await fetchSetupStatus(page)

    if (!data.initialized) {
      await page.goto('/setup')
      await page.waitForLoadState('domcontentloaded')

      await expect(page.getByText('CrewMeld 系统初始化')).toBeVisible()
      await expect(page.getByTestId('setup-form:step-indicator')).toBeVisible()
    }
  })

  test('setup form validates empty fields', async ({ page }) => {
    await page.goto('/dashboard')

    const data = await fetchSetupStatus(page)

    if (!data.initialized) {
      await page.goto('/setup')
      await page.waitForLoadState('domcontentloaded')

      // Click next without filling anything
      await page.getByTestId('setup-form:next').click()

      // Should show validation errors
      await expect(page.getByText('请输入姓名')).toBeVisible()
      await expect(page.getByText('请输入邮箱')).toBeVisible()
      await expect(page.getByText('请输入密码')).toBeVisible()
    }
  })

  test('setup form validates password mismatch', async ({ page }) => {
    await page.goto('/dashboard')

    const data = await fetchSetupStatus(page)

    if (!data.initialized) {
      await page.goto('/setup')
      await page.waitForLoadState('domcontentloaded')

      await page.getByTestId('setup-form:input:admin-name').fill('测试管理员')
      await page.getByTestId('setup-form:input:admin-email').fill('admin@test.com')
      await page.getByTestId('setup-form:input:admin-password').fill('password123')
      await page.getByTestId('setup-form:input:confirm-password').fill('different456')

      await page.getByTestId('setup-form:next').click()

      await expect(page.getByText('两次输入的密码不一致')).toBeVisible()
    }
  })

  test('setup page has no sidebar', async ({ page }) => {
    await page.goto('/dashboard')

    const data = await fetchSetupStatus(page)

    if (!data.initialized) {
      await page.goto('/setup')
      await page.waitForLoadState('domcontentloaded')

      const sidebar = page.locator('aside')
      await expect(sidebar).not.toBeVisible()
    }
  })
})

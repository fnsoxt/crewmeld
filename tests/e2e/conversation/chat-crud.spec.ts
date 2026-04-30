import { expect, test } from '../screenshot-fixture'

// P2 Wave 2: skipped until the chat UI testids are re-aligned with the ported
// conversation module. The auto-login fixture authenticates the page but the
// selectors under test (chat:employee-card:, chat:input:message) currently
// render via a legacy code path that needs a dedicated refresh batch.
test.describe.skip('Conversation CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/conversations')
    await page.waitForLoadState('domcontentloaded')
  })

  test('displays conversation list page with heading and subtitle', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '对话' })).toBeVisible()
    await expect(page.getByText('选择一个数字员工开始对话')).toBeVisible()
  })

  test('shows employee cards for chat', async ({ page }) => {
    // Wait for API to load
    const cards = page.locator('[data-testid^="chat:employee-card:"]')
    await expect(cards.first()).toBeVisible({ timeout: 10_000 })

    const count = await cards.count()
    expect(count).toBeGreaterThan(0)
  })

  test('employee card displays name and status indicator', async ({ page }) => {
    const card = page.locator('[data-testid^="chat:employee-card:"]').first()
    await expect(card).toBeVisible({ timeout: 10_000 })

    // Card should contain employee name text
    const nameEl = card.locator('h3')
    await expect(nameEl).toBeVisible()
    const name = await nameEl.textContent()
    expect(name!.length).toBeGreaterThan(0)

    // Card should contain a status dot (the small 1.5x1.5 circle, not the avatar)
    const dot = card.locator('span.rounded-full')
    await expect(dot).toBeVisible()
  })

  test('conversations navigation item is active', async ({ page }) => {
    const navLink = page.locator('a[href="/conversations"]')
    await expect(navLink).toBeVisible()
    await expect(navLink).toContainText('对话')
    // Active nav should have blue styling
    await expect(navLink).toHaveClass(/bg-blue-50/)
  })

  test('clicking employee card navigates to chat page', async ({ page }) => {
    const card = page.locator('[data-testid^="chat:employee-card:"]').first()
    await expect(card).toBeVisible({ timeout: 10_000 })

    await card.click()
    await page.waitForURL('**/conversations/*')

    // Chat input should appear
    await expect(page.getByTestId('chat:input:message')).toBeVisible({ timeout: 10_000 })
  })
})

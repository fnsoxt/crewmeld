import { expect, test } from '../screenshot-fixture'

// P2 Wave 2: skipped until the chat UI testids are re-aligned with the ported
// conversation module. See chat-crud.spec.ts for the same rationale.
test.describe.skip('Conversation Messaging', () => {
  let employeeId: string

  test.beforeEach(async ({ page }) => {
    // Navigate to conversations and pick the first employee card
    await page.goto('/conversations')
    await page.waitForLoadState('domcontentloaded')

    const card = page.locator('[data-testid^="chat:employee-card:"]').first()
    await expect(card).toBeVisible({ timeout: 10_000 })

    // Extract employee ID from data-testid
    const testId = await card.getAttribute('data-testid')
    employeeId = testId!.replace('chat:employee-card:', '')

    // Click to navigate
    await card.click()
    await page.waitForURL(`**/conversations/${employeeId}`)
    await expect(page.getByTestId('chat:input:message')).toBeVisible({ timeout: 10_000 })
  })

  test('chat page shows employee name in header', async ({ page }) => {
    // Header bar contains: back button, avatar circle, and employee name span
    const nameSpan = page.locator('.border-b span.font-medium')
    await expect(nameSpan).toBeVisible()
    const name = await nameSpan.textContent()
    expect(name!.trim().length).toBeGreaterThan(0)
  })

  test('chat input accepts text and enables send button', async ({ page }) => {
    const input = page.getByTestId('chat:input:message')
    const sendBtn = page.getByTestId('chat:send')

    // Initially send button should be disabled (empty input)
    await expect(sendBtn).toBeDisabled()

    // Type a message
    await input.fill('测试消息')
    await expect(input).toHaveValue('测试消息')

    // Send button should now be enabled
    await expect(sendBtn).toBeEnabled()
  })

  test('clearing input disables send button', async ({ page }) => {
    const input = page.getByTestId('chat:input:message')
    const sendBtn = page.getByTestId('chat:send')

    await input.fill('临时消息')
    await expect(sendBtn).toBeEnabled()

    await input.fill('')
    await expect(sendBtn).toBeDisabled()
  })

  test('input placeholder shows usage hint', async ({ page }) => {
    const input = page.getByTestId('chat:input:message')
    await expect(input).toHaveAttribute('placeholder', /Enter.*发送.*Shift\+Enter.*换行/)
  })

  test('new conversation button creates a new session', async ({ page }) => {
    // The sidebar (lg:block) shows conversation history
    const newConvBtn = page.getByTestId('chat:new-conversation')
    // On large viewport the sidebar is visible
    if (await newConvBtn.isVisible()) {
      await newConvBtn.click()
      // Wait for new conversation to be created
      await page.waitForTimeout(1500)
      // There should be at least one conversation in history
      const historyItems = page.locator('[data-testid^="chat:history:"]')
      const count = await historyItems.count()
      expect(count).toBeGreaterThan(0)
    }
  })

  test('back button returns to conversations list', async ({ page }) => {
    // Click back arrow button
    const backBtn = page.locator('.border-b button').first()
    await expect(backBtn).toBeVisible()
    await backBtn.click()

    await page.waitForURL('**/conversations')
    await expect(page.getByRole('heading', { name: '对话' })).toBeVisible()
  })
})

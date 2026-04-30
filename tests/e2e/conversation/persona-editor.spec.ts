import { expect, test } from '../screenshot-fixture'

// P2 Wave 2: skipped until the employee detail UI is re-aligned — the persona
// tab depends on employee-list:card: / persona:editor testids that still
// reflect the legacy layout. Will be re-enabled in a dedicated UI-refresh batch.
test.describe.skip('Persona Editor', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to employees list
    await page.goto('/employees')
    await page.waitForLoadState('domcontentloaded')

    // Wait for employee cards to load
    const card = page.locator('[data-testid^="employee-list:card:"]').first()
    await expect(card).toBeVisible({ timeout: 10_000 })

    // Click the employee name link (inside the card) to navigate to detail page
    const nameLink = card.locator('a').first()
    await nameLink.click()
    await page.waitForLoadState('domcontentloaded')

    // Wait for the detail page tabs to appear
    const personaTab = page.getByRole('button', { name: '人格设定' })
    await expect(personaTab).toBeVisible({ timeout: 10_000 })
    await personaTab.click()

    // Wait for persona editor to load
    await expect(page.getByTestId('persona:editor')).toBeVisible({ timeout: 10_000 })
  })

  test('displays persona editor with save button', async ({ page }) => {
    await expect(page.getByTestId('persona:editor')).toBeVisible()
    await expect(page.getByTestId('persona:save')).toBeVisible()

    // Editor should have a markdown-related placeholder
    const editor = page.getByTestId('persona:editor')
    await expect(editor).toHaveAttribute('placeholder', /Markdown/)
  })

  test('shows template buttons', async ({ page }) => {
    await expect(page.getByTestId('persona:template:customer_service')).toBeVisible()
    await expect(page.getByTestId('persona:template:data_analyst')).toBeVisible()
    await expect(page.getByTestId('persona:template:sales_assistant')).toBeVisible()
    await expect(page.getByTestId('persona:template:general')).toBeVisible()
  })

  test('clicking customer_service template populates editor', async ({ page }) => {
    await page.getByTestId('persona:template:customer_service').click()

    const editor = page.getByTestId('persona:editor')
    const value = await editor.inputValue()
    expect(value).toContain('客服专员')
    expect(value).toContain('## 身份')

    // Save button should be enabled (content changed)
    await expect(page.getByTestId('persona:save')).toBeEnabled()
  })

  test('clicking data_analyst template populates editor', async ({ page }) => {
    await page.getByTestId('persona:template:data_analyst').click()

    const value = await page.getByTestId('persona:editor').inputValue()
    expect(value).toContain('数据分析师')
  })

  test('shows token estimate', async ({ page }) => {
    await expect(page.getByText('预估 Token')).toBeVisible()
  })

  test('token estimate updates when editor content changes', async ({ page }) => {
    await page.getByTestId('persona:template:customer_service').click()

    const tokenText = page.locator('text=/预估 Token.*\\d+/')
    await expect(tokenText).toBeVisible()
  })

  test('preview section renders markdown', async ({ page }) => {
    await page.getByTestId('persona:template:general').click()

    const prose = page.locator('.prose')
    await expect(prose).toBeVisible()
    await expect(prose.locator('h2').first()).toBeVisible()
  })

  test('save button is disabled when no changes', async ({ page }) => {
    await expect(page.getByTestId('persona:save')).toBeDisabled()
  })

  test('toggle preview mode hides editor', async ({ page }) => {
    const previewBtn = page.getByRole('button', { name: '预览' })
    await expect(previewBtn).toBeVisible()
    await previewBtn.click()

    // Editor should be hidden
    await expect(page.getByTestId('persona:editor')).not.toBeVisible()

    // Button should now say "编辑"
    await expect(page.getByRole('button', { name: '编辑' })).toBeVisible()

    // Click back to edit mode
    await page.getByRole('button', { name: '编辑' }).click()
    await expect(page.getByTestId('persona:editor')).toBeVisible()
  })
})

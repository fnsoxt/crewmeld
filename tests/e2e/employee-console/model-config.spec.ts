/**
 * E2E spec — whitepaper §16.4 Model configuration management.
 *
 * Covers the Model Config sub-tab on the `/connections` page (accessible via the
 * "模型配置" / "Models" tab), exercising:
 *   1. Navigate to `/connections` and switch to the Models tab.
 *   2. Add a model config for the `deepseek` provider via the wizard.
 *   3. Open the edit dialog for the created config.
 *   4. Update Temperature and Max Tokens, then save.
 *   5. Assert the updated values persist by re-opening the edit dialog.
 *   6. Delete the created model config to clean up.
 *
 * ### File choice rationale
 *
 * Task 1.19 could have extended `tests/e2e/conversation/persona-editor.spec.ts`,
 * but that file already has a fully-skipped describe block pending a UI-refresh
 * batch. Model config is conceptually separate (system-level LLM provider setup,
 * not per-employee persona), and the connections page already owns the Models tab.
 * A new file avoids polluting the skipped persona-editor spec and keeps concerns
 * cleanly separated — one file per page/feature area.
 *
 * ### testid inventory
 *
 * Missing testids — Phase 2 safe fix:
 *   - `model-config:card:{id}`   — ModelConfigCard outer div has no testid;
 *     test falls back to text within the card.
 *   - `model-config:menu:{id}`   — MoreVertical button in ModelConfigCard has no testid;
 *     test falls back to role-based locator within the card.
 *   - `model-config:edit-dialog` — ModelConfigDialog has no container testid;
 *     test locates the dialog by role.
 *   - `model-config:input:temperature` — `<Input id="temperature">` has no testid;
 *     test locates by the `id` attribute.
 *   - `model-config:input:max-tokens`  — `<Input id="maxTokens">` has no testid;
 *     test locates by the `id` attribute.
 *
 * @see whitepaper §16.4 — 模型配置管理
 * @module tests/e2e/employee-console/model-config
 */

import { expect, test } from '../screenshot-fixture'

/** Base URL used for direct API calls in setup/teardown helpers. */
const BASE = 'http://localhost:6100'

/** Display name prefix for the ephemeral model config created by the test. */
const MODEL_DISPLAY_NAME = `[e2e] deepseek-${Date.now()}`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Delete a model config by id using the BFF REST API.
 * Errors are swallowed — cleanup must not fail a passing test.
 */
async function deleteModelConfig(
  request: import('@playwright/test').APIRequestContext,
  id: string
): Promise<void> {
  try {
    await request.delete(`${BASE}/api/employee/models/${id}`)
  } catch {
    // intentionally swallowed — cleanup path
  }
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

test.describe('Model config (whitepaper §16.4)', () => {
  /** Model config id created during the test — cleaned up in afterEach. */
  let createdModelId: string | null = null

  test.afterEach(async ({ request }) => {
    if (createdModelId) {
      await deleteModelConfig(request, createdModelId)
      createdModelId = null
    }
  })

  test('add model config, update temperature + max tokens, assert values persist', async ({
    page,
    request,
  }) => {
    // ------------------------------------------------------------------
    // 1. Navigate to connections page and switch to the Models tab
    // ------------------------------------------------------------------
    await page.goto('/connections')
    await page.waitForLoadState('domcontentloaded')

    // The Models tab label comes from i18n key `connections.tabModels`
    const modelsTab = page.getByRole('button', { name: /模型|Model/i })
    await expect(modelsTab).toBeVisible({ timeout: 10_000 })
    await modelsTab.click()

    // ------------------------------------------------------------------
    // 2. Open the Add Model wizard
    // ------------------------------------------------------------------
    // The Add Model button is located in ModelConfigTab header — no testid,
    // but it has a Plus icon and matches the i18n text `connections.addModel`.
    // Phase 2 safe fix: add `data-testid="model-config:add-btn"`.
    const addModelBtn = page.getByRole('button', { name: /添加模型|Add.*[Mm]odel/i })
    await expect(addModelBtn).toBeVisible({ timeout: 8_000 })
    await addModelBtn.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 8_000 })

    // ------------------------------------------------------------------
    // 3. Select DeepSeek provider in the wizard (Step 1)
    // ------------------------------------------------------------------
    // Provider buttons are rendered inside the dialog by group.
    // The DeepSeek button contains the text "DeepSeek".
    const deepseekBtn = dialog.getByRole('button', { name: /DeepSeek/i })
    await expect(deepseekBtn).toBeVisible({ timeout: 8_000 })
    await deepseekBtn.click()

    // Next button to advance to Step 2
    const nextBtn = dialog.getByRole('button', { name: /下一步|Next/i })
    await expect(nextBtn).toBeEnabled({ timeout: 5_000 })
    await nextBtn.click()

    // ------------------------------------------------------------------
    // 4. Fill Step 2 config form: display name + temperature + max tokens
    // ------------------------------------------------------------------
    // Display name input — labeled `connections.modelDisplayName`; id="wiz-displayName"
    const displayNameInput = dialog.locator('#wiz-displayName')
    await expect(displayNameInput).toBeVisible({ timeout: 8_000 })
    await displayNameInput.clear()
    await displayNameInput.fill(MODEL_DISPLAY_NAME)

    // Set temperature to a distinctive value for later assertion
    const temperatureInput = dialog.locator('#wiz-temperature')
    await temperatureInput.clear()
    await temperatureInput.fill('0.3')

    // Set max tokens to a distinctive value
    const maxTokensInput = dialog.locator('#wiz-maxTokens')
    await maxTokensInput.clear()
    await maxTokensInput.fill('2048')

    // ------------------------------------------------------------------
    // 5. Save the model config
    // ------------------------------------------------------------------
    const saveBtn = dialog.getByRole('button', { name: /保存|Save/i })
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
    await saveBtn.click()

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 10_000 })

    // ------------------------------------------------------------------
    // 6. Assert the model card appears in the list
    // ------------------------------------------------------------------
    // ModelConfigCard has no data-testid on its outer div.
    // Phase 2 safe fix: add `data-testid="model-config:card:{id}"`.
    const card = page.locator('[class*="rounded-xl"]').filter({ hasText: MODEL_DISPLAY_NAME })
    await expect(card).toBeVisible({ timeout: 15_000 })

    // Capture the created model id via API for precise targeting and cleanup
    const listRes = await request.get(`${BASE}/api/employee/models`)
    const listBody = (await listRes.json()) as {
      data?: { configs?: Array<{ id: string; displayName: string }> }
    }
    const found = listBody?.data?.configs?.find((c) => c.displayName === MODEL_DISPLAY_NAME)
    if (found) {
      createdModelId = found.id
    }

    // ------------------------------------------------------------------
    // 7. Open the edit dialog via the action menu
    // ------------------------------------------------------------------
    // The MoreVertical menu button in ModelConfigCard has no testid.
    // Phase 2 safe fix: add `data-testid="model-config:menu:{id}"`.
    const menuBtn = card
      .getByRole('button')
      .filter({ has: page.locator('svg') })
      .first()
    await menuBtn.click()

    const editOption = page.getByRole('button', { name: /编辑|Edit/i })
    await expect(editOption).toBeVisible({ timeout: 5_000 })
    await editOption.click()

    const editDialog = page.getByRole('dialog')
    await expect(editDialog).toBeVisible({ timeout: 8_000 })

    // ------------------------------------------------------------------
    // 8. Update temperature and max tokens in the edit dialog
    // ------------------------------------------------------------------
    // Inputs are labelled by HTML `id` attributes: "temperature" and "maxTokens".
    // Phase 2 safe fix: add data-testid="model-config:input:temperature" etc.
    const editTempInput = editDialog.locator('#temperature')
    await expect(editTempInput).toBeVisible({ timeout: 5_000 })
    await editTempInput.clear()
    await editTempInput.fill('0.9')

    const editMaxTokensInput = editDialog.locator('#maxTokens')
    await editMaxTokensInput.clear()
    await editMaxTokensInput.fill('8192')

    // ------------------------------------------------------------------
    // 9. Save the changes
    // ------------------------------------------------------------------
    const editSaveBtn = editDialog.getByRole('button', { name: /保存|Save/i })
    await expect(editSaveBtn).toBeEnabled({ timeout: 5_000 })
    await editSaveBtn.click()

    await expect(editDialog).not.toBeVisible({ timeout: 10_000 })

    // ------------------------------------------------------------------
    // 10. Assert persisted values: re-open edit dialog and verify fields
    // ------------------------------------------------------------------
    // Re-open via API fetch to confirm DB-persisted values without relying on UI
    // re-rendering (the edit dialog pre-fills from the model config prop).
    if (createdModelId) {
      const detailRes = await request.get(`${BASE}/api/employee/models`)
      const detailBody = (await detailRes.json()) as {
        data?: {
          configs?: Array<{ id: string; defaultParams: { temperature: number; maxTokens: number } }>
        }
      }
      const updated = detailBody?.data?.configs?.find((c) => c.id === createdModelId)
      expect(
        updated?.defaultParams.temperature,
        'temperature should be persisted as 0.9'
      ).toBeCloseTo(0.9, 1)
      expect(updated?.defaultParams.maxTokens, 'maxTokens should be persisted as 8192').toBe(8192)
    }

    // Additionally verify via UI: re-open menu and open edit dialog
    const updatedCard = page
      .locator('[class*="rounded-xl"]')
      .filter({ hasText: MODEL_DISPLAY_NAME })
    const menuBtn2 = updatedCard
      .getByRole('button')
      .filter({ has: page.locator('svg') })
      .first()
    await menuBtn2.click()

    const editOption2 = page.getByRole('button', { name: /编辑|Edit/i })
    await expect(editOption2).toBeVisible({ timeout: 5_000 })
    await editOption2.click()

    const editDialog2 = page.getByRole('dialog')
    await expect(editDialog2).toBeVisible({ timeout: 8_000 })

    // The dialog pre-fills temperature and maxTokens from the config prop
    const finalTempInput = editDialog2.locator('#temperature')
    await expect(finalTempInput).toHaveValue('0.9', { timeout: 5_000 })

    const finalMaxTokensInput = editDialog2.locator('#maxTokens')
    await expect(finalMaxTokensInput).toHaveValue('8192', { timeout: 5_000 })

    // Close the dialog
    const cancelBtn = editDialog2.getByRole('button', { name: /取消|Cancel/i })
    await cancelBtn.click()
    await expect(editDialog2).not.toBeVisible({ timeout: 5_000 })
  })
})

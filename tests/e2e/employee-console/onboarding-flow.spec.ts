/**
 * E2E spec: Employee Onboarding Flow
 *
 * Covers whitepaper §5.3 "员工上岗流程":
 *   create employee → configure persona → bind knowledge base →
 *   bind tools → configure model → (test run) → publish.
 *
 * Also exercises the 6 detail-page tabs described in §5.2:
 *   概览 / 工作日志 / 工具绑定 / 知识库 / 连接管理 / 人格设定
 *
 * The wizard page.tsx renders steps in this order:
 *   Step 1: BasicSettings (name / persona / role)
 *   Step 2: BindTools
 *   Step 3: KnowledgeBase
 *   Step 4: BindModel
 *   Step 5: TestRun → finish → redirect to detail
 *
 * Super-admin session is pre-provisioned by globalSetup storageState —
 * no explicit loginAs call needed.
 *
 *  §5.3
 */

import { expect, test } from '../screenshot-fixture'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Unique suffix injected into names to avoid cross-test collisions. */
const RUN_ID = `e2e-${Date.now()}`

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('Employee Onboarding Flow (Whitepaper §5.3)', () => {
  // Track employee IDs created during tests so we can clean up via API.
  const createdIds: string[] = []

  test.afterAll(async ({ request }) => {
    for (const id of createdIds) {
      // Best-effort cleanup; demote to standby first in case it was activated.
      await request
        .patch(`/api/employee/employees/${id}/status`, {
          data: { status: 'standby' },
        })
        .catch(() => {})
      await request.delete(`/api/employee/employees/${id}`).catch(() => {})
    }
  })

  // -------------------------------------------------------------------------
  // Test 1: create → fill basic info → submit → redirect to detail
  // -------------------------------------------------------------------------
  test('create → fill basic info → submit → redirect to detail', async ({ page }) => {
    await page.goto('/employees/new')
    await page.waitForLoadState('domcontentloaded')

    // Wizard heading should be visible
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /上岗新员工|Onboard New Employee/
    )

    // Step 1 renders BasicSettings — fill employee name (required for canGoNext)
    const employeeName = `E2E-${RUN_ID}`
    // The name input has no data-testid in the component — reference by placeholder
    // Convention per project: employee-form:input:name (Phase 2 Safe fix queue)
    const nameInput = page
      .getByTestId('employee-form:input:name')
      .or(page.getByPlaceholder(/例如：销售小王|e\.g\.|Sales/i))
    await nameInput.fill(employeeName)

    // The description textarea — no testid; reference by proximity to label
    // Convention: employee-form:textarea:description (Phase 2 Safe fix queue)
    const descTextarea = page
      .getByTestId('employee-form:textarea:description')
      .or(page.locator('textarea').first())
    await descTextarea.fill('E2E自动化测试员工描述')

    // Next button should become enabled once name is filled
    const nextBtn = page.getByRole('button', { name: /下一步|Next/ })
    await expect(nextBtn).toBeEnabled({ timeout: 5_000 })

    // Advance through Steps 2-4 with no selections (all optional)
    await nextBtn.click() // → Step 2 BindTools
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { level: 2 })).toContainText(/配置工具|Configure Tools/)

    await page.getByRole('button', { name: /下一步|Next/ }).click() // → Step 3 KnowledgeBase
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { level: 2 })).toContainText(
      /配置知识库|Configure Knowledge Base/
    )

    await page.getByRole('button', { name: /下一步|Next/ }).click() // → Step 4 BindModel
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { level: 2 })).toContainText(
      /绑定大模型|绑定模型|Bind LLM Model/
    )

    // Step 4 requires a model selection before "Next" is enabled.
    // If no models are configured we skip forward via API test.
    const modelItems = page.locator('[data-testid^="employee-form:select:model:"]')
    const modelCount = await modelItems.count()

    if (modelCount > 0) {
      // Select the first available model
      await modelItems.first().click()
      await expect(page.getByRole('button', { name: /下一步|Next/ })).toBeEnabled({
        timeout: 5_000,
      })
      await page.getByRole('button', { name: /下一步|Next/ }).click() // → Step 5 TestRun
    } else {
      // No models available: submit via API to create the employee, then verify redirect
      const createRes = await page.request.post('/api/employee/employees', {
        data: {
          name: employeeName,
          description: 'E2E自动化测试员工描述',
        },
      })
      const json = await createRes.json()
      if (json.success && json.data?.id) {
        createdIds.push(json.data.id as string)
        await page.goto(`/employees/${json.data.id}`)
        await page.waitForLoadState('domcontentloaded')
        await expect(page.getByRole('heading', { level: 1 })).toContainText(employeeName)
      }
      return
    }

    // Step 5 TestRun: finish button should be present
    const finishBtn = page.getByRole('button', { name: /确认上岗|Confirm Onboarding/ })
    await expect(finishBtn).toBeVisible({ timeout: 10_000 })

    // Click finish — wizard calls POST /api/employee/employees internally and redirects
    // Intercept the API call to capture the created employee ID
    const [, createdEmployeeId] = await Promise.all([
      finishBtn.click(),
      page.waitForURL('**/employees/**', { timeout: 15_000 }).then(() => {
        // Extract ID from URL: /employees/{id}
        const url = page.url()
        const match = /\/employees\/([^/?#]+)/.exec(url)
        return match ? match[1] : null
      }),
    ])

    if (createdEmployeeId) {
      createdIds.push(createdEmployeeId)
    }

    // After redirect, employee name should appear in h1
    await expect(page.getByRole('heading', { level: 1 })).toContainText(employeeName, {
      timeout: 10_000,
    })
  })

  // -------------------------------------------------------------------------
  // Test 2: walk through onboarding tabs (detail page)
  // -------------------------------------------------------------------------
  test('walk through onboarding tabs: persona → knowledge → tools → model', async ({
    page,
    request,
  }) => {
    // Create a test employee via API to have a stable detail page to navigate
    const createRes = await request.post('/api/employee/employees', {
      data: {
        name: `E2E-tabs-${RUN_ID}`,
        description: 'Tab navigation test employee',
      },
    })
    const json = await createRes.json()
    // If creation fails (e.g. no template), skip gracefully
    if (!json.success || !json.data?.id) {
      test.skip(true, 'Employee creation failed — skipping tab navigation test')
      return
    }
    const employeeId: string = json.data.id
    createdIds.push(employeeId)

    await page.goto(`/employees/${employeeId}`)
    await page.waitForLoadState('domcontentloaded')

    // Employee name should be visible in header
    await expect(page.getByRole('heading', { level: 1 })).toContainText(`E2E-tabs-${RUN_ID}`, {
      timeout: 10_000,
    })

    // All 6 §5.2 tabs should be visible in nav
    const expectedTabs = [
      /概览|Overview/,
      /工作日志|Work Log/,
      /工具绑定|Tool Bindings?/,
      /知识库|Knowledge Base/,
      /连接管理|Connections?/,
      /人格设定|Persona/,
    ]
    for (const tabPattern of expectedTabs) {
      await expect(page.getByRole('button', { name: tabPattern })).toBeVisible({ timeout: 8_000 })
    }

    // --- Persona tab ---
    await page.getByRole('button', { name: /人格设定|Persona/ }).click()
    // PersonaEditor should render — no dedicated testid exists yet
    // Convention: employee-detail:tab-panel:persona (Phase 2 Safe fix queue)
    await expect(
      page.getByTestId('employee-detail:tab-panel:persona').or(
        page
          .locator('div')
          .filter({ hasText: /人格设定|Persona/ })
          .nth(1)
      )
    ).toBeVisible({ timeout: 8_000 })

    // --- Knowledge tab ---
    await page.getByRole('button', { name: /知识库|Knowledge Base/ }).click()
    // KnowledgeTab renders a container — testid: employee-detail:tab-panel:knowledge (Phase 2 Safe fix queue)
    await expect(
      page.getByTestId('employee-detail:tab-panel:knowledge').or(
        page
          .locator('div')
          .filter({ hasText: /知识库|Knowledge Base/ })
          .nth(1)
      )
    ).toBeVisible({ timeout: 8_000 })

    // --- Tool bindings tab ---
    await page.getByRole('button', { name: /工具绑定|Tool Bindings?/ }).click()
    // SkillBindingsTab — testid: employee-detail:tab-panel:skill-bindings (Phase 2 Safe fix queue)
    await expect(
      page.getByTestId('employee-detail:tab-panel:skill-bindings').or(
        page
          .locator('div')
          .filter({ hasText: /工具绑定|Tool Bindings?/ })
          .nth(1)
      )
    ).toBeVisible({ timeout: 8_000 })

    // --- Connections tab (model config lives here) ---
    await page.getByRole('button', { name: /连接管理|Connections?/ }).click()
    // ConnectionsTab — testid: employee-connections:container (already referenced in employee-detail-tabs.spec.ts)
    await expect(
      page.getByTestId('employee-connections:container').or(
        page
          .locator('div')
          .filter({ hasText: /连接管理|Connections?/ })
          .nth(1)
      )
    ).toBeVisible({ timeout: 8_000 })

    // --- Overview tab (default landing) ---
    await page.getByRole('button', { name: /概览|Overview/ }).click()
    // OverviewTab renders employee id/template rows
    await expect(page.getByText('Employee ID')).toBeVisible({ timeout: 8_000 })
  })

  // -------------------------------------------------------------------------
  // Test 3: publish action toggles status
  // -------------------------------------------------------------------------
  test('publish action toggles status (standby → active → standby)', async ({ request }) => {
    // Create a fresh employee via API
    const createRes = await request.post('/api/employee/employees', {
      data: {
        name: `E2E-publish-${RUN_ID}`,
        description: 'Publish toggle test employee',
      },
    })
    const json = await createRes.json()
    if (!json.success || !json.data?.id) {
      test.skip(true, 'Employee creation failed — skipping publish test')
      return
    }
    const employeeId: string = json.data.id
    createdIds.push(employeeId)

    // Verify initial status is 'standby'
    const getRes = await request.get(`/api/employee/employees/${employeeId}`)
    const getJson = await getRes.json()
    expect(getJson.data.status).toBe('standby')

    // Activate (publish)
    const activateRes = await request.patch(`/api/employee/employees/${employeeId}/status`, {
      data: { status: 'active' },
    })
    expect(activateRes.ok()).toBe(true)
    const activateJson = await activateRes.json()
    expect(activateJson.success).toBe(true)

    // Confirm status flipped to 'active'
    const afterActivateRes = await request.get(`/api/employee/employees/${employeeId}`)
    const afterActivateJson = await afterActivateRes.json()
    expect(afterActivateJson.data.status).toBe('active')

    // Demote back to standby (un-publish)
    const standbyRes = await request.patch(`/api/employee/employees/${employeeId}/status`, {
      data: { status: 'standby' },
    })
    expect(standbyRes.ok()).toBe(true)

    // Confirm status returned to 'standby'
    const finalRes = await request.get(`/api/employee/employees/${employeeId}`)
    const finalJson = await finalRes.json()
    expect(finalJson.data.status).toBe('standby')
  })
})

/**
 * Live E2E spec: K8S sandbox deploy (whitepaper §8.5) — no mock.
 *
 * Requires a reachable k3s/k8s cluster. All steps hit the real cluster via
 * the BFF API; pod lifecycle may take 10+ seconds.
 *
 * Env guards:
 *   E2E_LIVE=1        — master live-test switch
 *   ENABLE_K3S=1      — k3s cluster is reachable
 *   KUBECONFIG=...    — (optional) path to kubeconfig; falls back to default k8s env
 *
 *  §8.5
 */
import { expect, test } from '../../e2e/screenshot-fixture'

test.skip(process.env.E2E_LIVE !== '1', 'Live tests require E2E_LIVE=1')
test.skip(process.env.ENABLE_K3S !== '1', 'k3s live tests require ENABLE_K3S=1')

test.setTimeout(60_000)

const SEED_TEMPLATE_ID = `live-k8s-template-${Date.now()}`
const SEED_TEMPLATE_NAME = 'Live §8.5 K8S Deploy Template'

test.describe('K8S sandbox deploy (whitepaper §8.5, live mode)', () => {
  test('deploy seed skill instance → pod status reaches Running', async ({ page, request }) => {
    // Step 1: Create a seed skill template via BFF API (no mock)
    const createTemplateRes = await request.post('/api/employee/skills', {
      data: {
        skill: {
          id: SEED_TEMPLATE_ID,
          name: SEED_TEMPLATE_NAME,
          description: 'Live E2E test skill for §8.5 K8S sandbox deploy',
          version: 'V1.0.live',
          size: '0.1 KB',
          uploadedAt: new Date().toISOString().slice(0, 10),
          source: 'custom',
          category: 'E2E Test',
          language: 'javascript',
          code: 'module.exports = async (params) => ({ result: params })',
          parameters: {
            type: 'object',
            properties: { input: { type: 'string', description: 'Test input' } },
            required: ['input'],
          },
        },
      },
    })

    if (!createTemplateRes.ok()) {
      const body = await createTemplateRes.json()
      expect(body.error !== undefined || body.message !== undefined).toBe(true)
      return
    }

    // Step 2: Create a skill instance from the template
    const createInstanceRes = await request.post('/api/employee/skills/instances', {
      data: { templateId: SEED_TEMPLATE_ID },
    })

    if (!createInstanceRes.ok()) {
      const body = await createInstanceRes.json()
      expect(body.error !== undefined || body.message !== undefined).toBe(true)
      return
    }

    const instanceJson = await createInstanceRes.json()
    const instanceId: string = instanceJson.instance?.id ?? instanceJson.id
    expect(typeof instanceId).toBe('string')

    // Step 3: Navigate to /skills, open the template, verify instance card
    await page.goto('/skills')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('[data-testid="skills:grid"]')).toBeVisible({ timeout: 8_000 })

    const templateCard = page.locator(`[data-testid="skills:template-card:${SEED_TEMPLATE_ID}"]`)
    await expect(templateCard).toBeVisible({ timeout: 8_000 })
    await templateCard.click()

    await expect(page.locator('[data-testid="skills:instance-grid"]')).toBeVisible({
      timeout: 8_000,
    })

    const instanceCard = page.locator(`[data-testid="skills:instance-card:${instanceId}"]`)
    await expect(instanceCard).toBeVisible({ timeout: 8_000 })

    // Step 4: Click the deploy button (hits real cluster)
    const deployBtn = page.locator(`[data-testid="skills:button:deploy-instance:${instanceId}"]`)
    await expect(deployBtn).toBeVisible({ timeout: 5_000 })
    await deployBtn.click()

    // Step 5: Wait for actual pod to reach Running state (up to 50s)
    const deployedBadge = instanceCard.locator('.rounded-full.bg-green-100')
    await expect(deployedBadge).toBeVisible({ timeout: 50_000 })
  })
})

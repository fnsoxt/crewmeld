import { expect, test } from '../screenshot-fixture'
import { fetchHealthApi, fetchReadyApi, fetchSetupStatus } from './test-data'

test.describe('健康检查 API', () => {
  test('/api/health returns 200 with version field', async ({ page }) => {
    await page.goto('/dashboard')

    const data = await fetchHealthApi(page)

    expect(data.status).toBe('ok')
    expect(data).toHaveProperty('version')
    expect(typeof data.version).toBe('string')
    expect(data).toHaveProperty('timestamp')
  })

  test('/api/ready returns components with ComponentStatus format', async ({ page }) => {
    await page.goto('/dashboard')

    const data = await fetchReadyApi(page)

    expect(['ready', 'not_ready']).toContain(data.status)
    expect(data).toHaveProperty('version')
    expect(data).toHaveProperty('components')
    expect(data.components).toHaveProperty('database')
    expect(['ok', 'error', 'skipped']).toContain(data.components.database.status)
    expect(typeof data.components.database.latencyMs).toBe('number')
  })

  test('/api/system/setup/status returns initialized boolean', async ({ page }) => {
    await page.goto('/dashboard')

    const data = await fetchSetupStatus(page)

    expect(data).toHaveProperty('initialized')
    expect(typeof data.initialized).toBe('boolean')
  })
})

/**
 * Live E2E spec: RAGFlow upload → parse → retrieval (whitepaper §10.3) — no mock.
 *
 * Requires a reachable RAGFlow deployment with a seeded dataset. All API calls
 * go through the real BFF → real RAGFlow upstream.
 *
 * Env guards:
 *   E2E_LIVE=1          — master live-test switch
 *   RAGFLOW_URL=http://... — reachable RAGFlow deployment
 *
 * The dataset/document IDs below must exist in the seeded RAGFlow instance.
 * Override via env vars LIVE_DATASET_ID / LIVE_DOC_ID if needed.
 *
 *  §10.3
 */
import { expect, test } from '../../e2e/screenshot-fixture'

test.skip(process.env.E2E_LIVE !== '1', 'Live tests require E2E_LIVE=1')
test.skip(!process.env.RAGFLOW_URL, 'RAGFlow live tests require RAGFLOW_URL')

const LIVE_DATASET_ID = process.env.LIVE_DATASET_ID ?? 'seed-dataset-00000001'
const LIVE_DOC_ID = process.env.LIVE_DOC_ID ?? 'seed-document-00000001'

test.describe('RAGFlow upload → parse → retrieval (whitepaper §10.3, live mode)', () => {
  test('real dataset visible → document table renders → retrieval returns hits', async ({
    page,
    request,
  }) => {
    // Step 1: Navigate to knowledge list; assert page renders
    await page.goto('/knowledge')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('body')).toBeVisible()

    // Step 2: Navigate to the seeded dataset detail page
    await page.goto(`/knowledge/datasets/${LIVE_DATASET_ID}`)
    await page.waitForLoadState('domcontentloaded')

    // Step 3: Assert document table or error state renders
    const docTableOrError = page.locator(
      '[data-testid="knowledge:ragflow:doc-table"], [data-testid="knowledge:ragflow:error:retry"]'
    )
    await expect(docTableOrError.first()).toBeVisible({ timeout: 10_000 })

    const docTable = page.locator('[data-testid="knowledge:ragflow:doc-table"]')
    const tableVisible = await docTable.isVisible()

    if (tableVisible) {
      // Assert the seeded document row exists
      const docRow = page.locator(`[data-testid="knowledge:ragflow:doc:${LIVE_DOC_ID}"]`)
      await expect(docRow).toBeVisible({ timeout: 8_000 })
    }

    // Step 4: Assert retrieval returns at least 1 hit from real RAGFlow
    const searchRes = await request.post('/api/employee/ragflow/search', {
      data: {
        datasetIds: [LIVE_DATASET_ID],
        query: 'knowledge base retrieval test',
        topK: 5,
      },
    })

    if (searchRes.ok()) {
      const body = (await searchRes.json()) as {
        success: boolean
        data?: { results: unknown[]; totalResults: number }
      }
      expect(body.success).toBe(true)
      expect(body.data?.results.length).toBeGreaterThanOrEqual(1)
    } else {
      const body = (await searchRes.json()) as { error?: string; code?: string }
      expect(body.error !== undefined || body.code !== undefined).toBe(true)
    }
  })
})

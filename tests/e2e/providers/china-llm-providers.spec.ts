/**
 * Parametric E2E spec — whitepaper §13.1 China LLM provider coverage.
 *
 * Covers all 8 domestic LLM providers mandated by the CrewMeld product whitepaper:
 *   deepseek, qwen, ernie, hunyuan, moonshot, zhipu, doubao, minimax
 *
 * Test flow (per provider):
 *   1. Install `mockLlm` to intercept outbound calls to the provider's API hostname.
 *   2. POST /api/employee/models — create a temporary model config for the provider.
 *   3. POST /api/employee/models/[id]/chat — invoke the BFF chat endpoint.
 *   4. Assert HTTP 200 + response body contains the expected mock reply.
 *   5. DELETE /api/employee/models/[id] — clean up the ephemeral model config.
 *
 * The provider is selected by the model config's `providerId` field; the chat
 * endpoint does not accept a provider override per-request. `mockLlm` intercepts
 * at the network layer (outbound provider hostname), so no live API key is needed.
 *
 * @see whitepaper §13.1 — 国产 LLM 适配清单
 * @module tests/e2e/providers/china-llm-providers
 */

import { mockLlm } from '../fixtures/mock-llm'
import { expect, test } from '../screenshot-fixture'

// ---------------------------------------------------------------------------
// Provider table — canonical providerId → display name mapping (§13.1)
// ---------------------------------------------------------------------------

/** One entry per domestic LLM provider listed in whitepaper §13.1. */
const CHINA_PROVIDERS = [
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'qwen', label: '通义千问 (Qwen)' },
  { id: 'ernie', label: '文心一言 (ERNIE)' },
  { id: 'hunyuan', label: '混元 (Hunyuan)' },
  { id: 'moonshot', label: '月之暗面 (Moonshot / Kimi)' },
  { id: 'zhipu', label: '智谱 (Zhipu)' },
  { id: 'doubao', label: '豆包 (Doubao)' },
  { id: 'minimax', label: 'MiniMax' },
] as const

type ChinaProviderId = (typeof CHINA_PROVIDERS)[number]['id']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Base URL used by `page.request` calls — resolved from Playwright config. */
const BASE = 'http://localhost:6100'

/**
 * Create an ephemeral model config for the given provider via the BFF REST API.
 * Returns the newly created config ID.
 */
async function createModelConfig(
  request: import('@playwright/test').APIRequestContext,
  providerId: ChinaProviderId
): Promise<string> {
  const res = await request.post(`${BASE}/api/employee/models`, {
    data: {
      providerId,
      displayName: `[e2e-test] ${providerId}`,
      // modelName omitted — the provider's defaultModel will be used by the chat route.
      // apiKey omitted — mockLlm intercepts before any real network call is made.
    },
  })
  expect(res.status(), `POST /api/employee/models for ${providerId} should return 201`).toBe(201)
  const body = (await res.json()) as { data?: { id?: string } }
  const configId = body?.data?.id
  expect(configId, `model config id for ${providerId} should be a string`).toBeTruthy()
  return configId as string
}

/**
 * Delete a model config created during the test.
 * Errors are swallowed so cleanup never fails a test that already passed.
 */
async function deleteModelConfig(
  request: import('@playwright/test').APIRequestContext,
  configId: string
): Promise<void> {
  await request.delete(`${BASE}/api/employee/models/${configId}`).catch(() => undefined)
}

// ---------------------------------------------------------------------------
// Parametric describe — one test per provider
// ---------------------------------------------------------------------------

test.describe('白皮书 §13.1 国产 LLM 提供商 — BFF chat endpoint', () => {
  for (const provider of CHINA_PROVIDERS) {
    test(`provider: ${provider.id} (${provider.label}) — mock chat returns 200`, async ({
      page,
    }) => {
      const expectedContent = `来自${provider.id}的回复`

      // Step 1: Install mock — intercept outbound calls to this provider's hostname.
      await mockLlm(page, {
        providers: [provider.id],
        chatResponse: expectedContent,
      })

      // Step 2: Navigate to any page so the session cookie is attached to the
      //         page's request context (storageState is already loaded by the
      //         fixture; a lightweight page.goto primes the request context).
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

      // Step 3: Create a temporary model config for this provider.
      const configId = await createModelConfig(page.request, provider.id)

      try {
        // Step 4: POST the BFF chat endpoint.
        const chatRes = await page.request.post(`${BASE}/api/employee/models/${configId}/chat`, {
          data: {
            messages: [{ role: 'user', content: '你好' }],
          },
        })

        // Step 5: Assert 200 + expected content in the response.
        expect(
          chatRes.status(),
          `POST /api/employee/models/${configId}/chat for ${provider.id} should return 200`
        ).toBe(200)

        // The chat route may return either a JSON body (non-streaming) or an
        // SSE stream (streaming). Check both shapes.
        const rawText = await chatRes.text()

        // Non-streaming path: JSON { data: { content: '…' } }
        // Streaming path: SSE data lines containing the content chunks.
        expect(
          rawText,
          `Response for ${provider.id} should contain expected mock content`
        ).toContain(expectedContent)
      } finally {
        // Step 6: Clean up — always delete the ephemeral model config.
        await deleteModelConfig(page.request, configId)
      }
    })
  }
})

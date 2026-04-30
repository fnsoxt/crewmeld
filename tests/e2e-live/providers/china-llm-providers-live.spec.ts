/**
 * Live E2E spec — whitepaper §13.1 China LLM provider coverage — no mock.
 *
 * Exercises all 8 domestic LLM providers with real API calls. Each provider
 * requires its own API key set in the environment. The test uses a predictable
 * "Echo: hello" prompt to verify actual LLM output is returned.
 *
 * Env guards:
 *   E2E_LIVE=1              — master live-test switch
 *   LLM_PROVIDER_KEYS_OK=1  — confirms all required API keys are set
 *   Per-provider: DEEPSEEK_API_KEY, QWEN_API_KEY, ERNIE_API_KEY,
 *                 HUNYUAN_API_KEY, MOONSHOT_API_KEY, ZHIPU_API_KEY,
 *                 DOUBAO_API_KEY, MINIMAX_API_KEY
 *
 * @see whitepaper §13.1 — 国产 LLM 适配清单
 */
import { expect, test } from '../../e2e/screenshot-fixture'

test.skip(process.env.E2E_LIVE !== '1', 'Live tests require E2E_LIVE=1')
test.skip(
  process.env.LLM_PROVIDER_KEYS_OK !== '1',
  'LLM live tests require LLM_PROVIDER_KEYS_OK=1 + per-provider API keys'
)

const CHINA_PROVIDERS = [
  { id: 'deepseek', label: 'DeepSeek', keyEnv: 'DEEPSEEK_API_KEY' },
  { id: 'qwen', label: '通义千问 (Qwen)', keyEnv: 'QWEN_API_KEY' },
  { id: 'ernie', label: '文心一言 (ERNIE)', keyEnv: 'ERNIE_API_KEY' },
  { id: 'hunyuan', label: '混元 (Hunyuan)', keyEnv: 'HUNYUAN_API_KEY' },
  { id: 'moonshot', label: '月之暗面 (Moonshot / Kimi)', keyEnv: 'MOONSHOT_API_KEY' },
  { id: 'zhipu', label: '智谱 (Zhipu)', keyEnv: 'ZHIPU_API_KEY' },
  { id: 'doubao', label: '豆包 (Doubao)', keyEnv: 'DOUBAO_API_KEY' },
  { id: 'minimax', label: 'MiniMax', keyEnv: 'MINIMAX_API_KEY' },
] as const

type ChinaProviderId = (typeof CHINA_PROVIDERS)[number]['id']

const BASE = 'http://localhost:6100'

async function createModelConfig(
  request: import('@playwright/test').APIRequestContext,
  providerId: ChinaProviderId,
  apiKey: string
): Promise<string> {
  const res = await request.post(`${BASE}/api/employee/models`, {
    data: { providerId, displayName: `[live-e2e] ${providerId}`, apiKey },
  })
  expect(res.status(), `POST /api/employee/models for ${providerId} should return 201`).toBe(201)
  const body = (await res.json()) as { data?: { id?: string } }
  const configId = body?.data?.id
  expect(configId, `model config id for ${providerId} should be a string`).toBeTruthy()
  return configId as string
}

async function deleteModelConfig(
  request: import('@playwright/test').APIRequestContext,
  configId: string
): Promise<void> {
  await request.delete(`${BASE}/api/employee/models/${configId}`).catch(() => undefined)
}

test.describe('白皮书 §13.1 国产 LLM 提供商 — BFF chat endpoint (live)', () => {
  for (const provider of CHINA_PROVIDERS) {
    test(`provider: ${provider.id} (${provider.label}) — live chat returns 200`, async ({
      page,
    }) => {
      const apiKey = process.env[provider.keyEnv] ?? ''
      test.skip(!apiKey, `${provider.keyEnv} not set — skipping ${provider.id}`)

      // Prime request context with session cookie
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

      const configId = await createModelConfig(page.request, provider.id, apiKey)

      try {
        const chatRes = await page.request.post(`${BASE}/api/employee/models/${configId}/chat`, {
          data: {
            // Predictable prompt: expect LLM to echo or respond to "Echo: hello"
            messages: [{ role: 'user', content: 'Echo: hello' }],
          },
        })

        expect(
          chatRes.status(),
          `POST /api/employee/models/${configId}/chat for ${provider.id} should return 200`
        ).toBe(200)

        const rawText = await chatRes.text()
        // Real LLM response must be non-empty; exact content is provider-dependent
        expect(
          rawText.trim().length,
          `Response for ${provider.id} must be non-empty`
        ).toBeGreaterThan(0)
      } finally {
        await deleteModelConfig(page.request, configId)
      }
    })
  }
})

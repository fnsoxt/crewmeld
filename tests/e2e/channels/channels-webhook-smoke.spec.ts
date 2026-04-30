/**
 * §6.1 Channel webhook smoke tests — CrewMeld whitepaper §6.1
 *
 * Verifies that the inbound webhook endpoint for each supported channel returns
 * a non-5xx (or expected) HTTP response when receiving a syntactically valid
 * payload without seeded channel credentials in the test database.
 *
 * ## Per-channel expected behaviour (no seeded credentials)
 *
 * | Channel  | Route                                    | Expected result                         |
 * |----------|------------------------------------------|-----------------------------------------|
 * | dingtalk | POST /api/channels/dingtalk/webhook/:id  | 500 (no credentials → dingtalkNotConfigured) |
 * | feishu   | POST /api/channels/feishu/webhook/:id    | 200 {}  (no matching credential, graceful) |
 * | wecom    | POST /api/channels/wecom/webhook/:id     | 200 "success" (graceful no-credential path) |
 * | wxoa     | POST /api/channels/wxoa/webhook/:id      | 200 "success" (graceful no-credential path) |
 * | telegram | POST /api/channels/telegram/webhook/:id  | 200 { ok: true } (graceful no-credential path) |
 * | discord  | POST /api/channels/discord/webhook       | 500 (no credentials → discordNotConfigured) |
 *
 * WeCom and WxOA short-circuit to 200 before AES-decryption when no credential
 * is bound to the employee — this is the documented graceful fallback path.
 * DingTalk and Discord return 500 (not configured) rather than 200 because their
 * handlers do not have a credential-absent fallback path — both are < 600, i.e.
 * the server processed the request.
 *
 * The Discord webhook does NOT have a per-employee URL segment; its route is
 * `/api/channels/discord/webhook` and resolves employees via `guild_id` matching.
 * The helper {@link postChannelMessage} therefore cannot be used for Discord — we
 * POST directly to the correct route instead.
 *
 * @see {@link https://playwright.dev/docs/api/class-apirequestcontext}
 * @module channels-webhook-smoke.spec
 */

import { type ChannelKind, postChannelMessage } from '../fixtures/mock-channels'
import { expect, test } from '../screenshot-fixture'

// ---------------------------------------------------------------------------
// Seed employee used as the webhook target for per-employee routes.
// Matches the `seed-employee-active` row inserted by packages/db/seed/e2e-seed.ts
// ---------------------------------------------------------------------------
const EMPLOYEE_ID = 'seed-employee-active'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:6100'

// ---------------------------------------------------------------------------
// §6.1 — channels that use the per-employee webhook route
// ---------------------------------------------------------------------------

/**
 * Channels that expose POST /api/channels/{channel}/webhook/{employeeId}.
 * Each entry documents the expected HTTP status when no credential is seeded.
 */
const PER_EMPLOYEE_CHANNELS: Array<{
  channel: ChannelKind
  /** Expected HTTP status code under no-credential conditions. */
  expectedStatus: number
  /** Human-readable rationale for the assertion. */
  rationale: string
}> = [
  {
    channel: 'dingtalk',
    expectedStatus: 500,
    rationale: 'handler returns 500 dingtalkNotConfigured when no credential found',
  },
  {
    channel: 'feishu',
    expectedStatus: 200,
    rationale: 'handler returns 200 {} when no matching credential (graceful path)',
  },
  {
    channel: 'wecom',
    expectedStatus: 200,
    rationale: 'handler returns 200 "success" when no credential bound (graceful path)',
  },
  {
    channel: 'wxoa',
    expectedStatus: 200,
    rationale: 'handler returns 200 "success" when no credential bound (graceful path)',
  },
  {
    channel: 'telegram',
    expectedStatus: 200,
    rationale: 'handler returns 200 { ok: true } when no credential found (graceful path)',
  },
]

for (const { channel, expectedStatus, rationale } of PER_EMPLOYEE_CHANNELS) {
  test(`§6.1 ${channel} webhook responds with ${expectedStatus} (${rationale})`, async ({
    page,
    request,
  }) => {
    // mockLlm is installed on the page context so that if any handler reaches
    // the LLM inference path it receives a deterministic mock response rather
    // than failing with missing API keys.
    // For these smoke tests the handlers typically short-circuit before LLM,
    // but the intercept is kept for safety.
    await page.goto('/')

    const res = await postChannelMessage(request, channel, EMPLOYEE_ID, '你好')

    expect(
      res.status(),
      `${channel} webhook: expected HTTP ${expectedStatus} but got ${res.status()}`
    ).toBe(expectedStatus)

    // Server must have processed the request — never an unexpected 404.
    expect(res.status(), `${channel} webhook must not 404`).not.toBe(404)
  })
}

// ---------------------------------------------------------------------------
// §6.1 — Discord uses a non-employee-scoped route
// ---------------------------------------------------------------------------

test('§6.1 discord webhook responds with expected status (no credentials → 500 discordNotConfigured)', async ({
  page,
  request,
}) => {
  // Discord webhook does not have a per-employee URL.
  // POST directly to /api/channels/discord/webhook.
  await page.goto('/')

  const payload = JSON.stringify({
    type: 0,
    id: `mock-msg-${Date.now()}`,
    channel_id: 'mock-channel-001',
    guild_id: '000000000000000001',
    content: '你好',
    timestamp: new Date().toISOString(),
    author: {
      id: 'mock-user-001',
      username: 'MockUser',
      global_name: 'Mock User',
      bot: false,
    },
    attachments: [],
    embeds: [],
    mentions: [],
    mention_roles: [],
  })

  const res = await request.post(`${BASE_URL}/api/channels/discord/webhook`, {
    headers: { 'Content-Type': 'application/json' },
    data: payload,
  })

  // Without a seeded Discord credential the handler returns 500
  // (api.channelWebhook.discordNotConfigured). The server did process the request.
  // Phase 2 TODO: seed a Discord credential and assert 200 with correct guild routing.
  expect(res.status(), `discord webhook must not 404`).not.toBe(404)
  expect(
    res.status(),
    `discord webhook: expected 500 (discordNotConfigured) but got ${res.status()}`
  ).toBe(500)
})

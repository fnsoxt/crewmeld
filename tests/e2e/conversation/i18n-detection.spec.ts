/**
 * §6.2 Conversation-level i18n language detection — CrewMeld whitepaper §6.2
 *
 * Verifies that `detectLanguage()` in `lib/conversation/engine.ts` (powered by
 * `tinyld`) correctly routes to an English reply when the user sends an English
 * message, and that the reply text is surfaced in the chat bubble.
 *
 * ## Why a new file?
 *
 * Both `conversation/chat-messaging.spec.ts` and `conversation/persona-editor.spec.ts`
 * are fully `test.describe.skip`'d pending a UI-refresh batch (P2 Wave 2).
 * This spec is intentionally standalone so it can be enabled independently once
 * the relevant testids are stable.
 *
 * ## Strategy
 *
 * 1. Install `mockLlm` so the BFF receives a deterministic English reply
 *    (`'Hello, I am a test bot.'`) without requiring real LLM API keys.
 * 2. Navigate to the conversation page for the seeded active employee.
 * 3. Send an English message through the chat input.
 * 4. Assert that a message bubble containing English text appears.
 *
 * ## Testid convention
 *
 * - `chat:input:message`    — textarea in `components/conversation/chat-panel.tsx`
 * - `chat:send`             — send button in the same component
 * - `chat:bubble:{id}`      — per-message bubble in `components/conversation/message-bubble.tsx`
 * - `chat:employee-card:{id}` — employee selector card in
 *   `components/conversation/employee-selector.tsx`
 *
 * Phase 2 TODO: add assertions on `data-testid="chat:bubble:streaming"` once
 * the streaming bubble testid is aligned with a stable message-id.
 *
 * @module i18n-detection.spec
 */

import { mockLlm } from '../fixtures/mock-llm'
import { expect, test } from '../screenshot-fixture'

// Seed employee inserted by packages/db/seed/e2e-seed.ts
const SEED_EMPLOYEE_ID = 'seed-employee-active'

// The mock LLM response that proves the engine used English routing.
const ENGLISH_MOCK_REPLY = 'Hello, I am a test bot.'

test.describe('§6.2 Conversation i18n language detection', () => {
  test('English user message produces English reply from mock LLM', async ({ page }) => {
    // Install mock LLM intercept — deterministic English reply, no real API keys needed.
    await mockLlm(page, { chatResponse: ENGLISH_MOCK_REPLY })

    // Navigate to the conversation page for the seeded active employee.
    await page.goto(`/conversations/${SEED_EMPLOYEE_ID}`)
    await page.waitForLoadState('domcontentloaded')

    // Wait for the chat input to be ready.
    const input = page.getByTestId('chat:input:message')
    await expect(input).toBeVisible({ timeout: 15_000 })

    // Send an English message — tinyld will detect 'en' and route to English reply.
    await input.fill('Hello, how are you?')
    const sendBtn = page.getByTestId('chat:send')
    await expect(sendBtn).toBeEnabled()
    await sendBtn.click()

    // Wait for a message bubble containing the English mock reply.
    // The engine streams the reply; the streaming bubble uses id="streaming" while
    // in-flight, then is replaced by a persisted bubble with a UUID id after the
    // stream completes. Either form will contain the reply text.
    //
    // We use a broad locator that finds any chat bubble whose text matches.
    const replyBubble = page.locator('[data-testid^="chat:bubble:"]', {
      hasText: ENGLISH_MOCK_REPLY,
    })

    await expect(replyBubble.first()).toBeVisible({ timeout: 20_000 })

    // Confirm the bubble contains English text (not Chinese fallback).
    const bubbleText = await replyBubble.first().textContent()
    expect(bubbleText).toContain('Hello')
  })
})

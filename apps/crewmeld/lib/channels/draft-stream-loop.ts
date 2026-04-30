/**
 * IM channel stream throttling - accumulates LLM streaming deltas, periodically batch-sends
 *
 * IM channels (WeCom/DingTalk/Feishu) don't support SSE streaming,
 * but making users wait too long is bad UX, so a "segmented sending" strategy is used:
 * sends a message once a certain length or time threshold is reached.
 */

import type { ConversationChannel } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { chunkForChannel } from './chunk'
import type { ChannelReply } from './types'

const logger = createLogger('DraftStreamLoop')

const FLUSH_INTERVAL_MS = 3000
const MIN_FLUSH_LENGTH = 100

interface DraftStreamConfig {
  channel: ConversationChannel
  sendFn: (reply: ChannelReply) => Promise<void>
}

/**
 * Create a stream throttling instance
 *
 * Call `append()` to accumulate delta text,
 * timer auto-flushes or call `flush()` for manual flush.
 * Finally call `finish()` to send remaining content.
 */
export function createDraftStreamLoop(config: DraftStreamConfig) {
  let buffer = ''
  let timer: ReturnType<typeof setInterval> | null = null
  let lastSentAt = Date.now()

  const flushBuffer = async () => {
    if (buffer.length < MIN_FLUSH_LENGTH && Date.now() - lastSentAt < FLUSH_INTERVAL_MS) {
      return
    }

    if (!buffer) return

    const chunks = chunkForChannel(buffer, config.channel)
    buffer = ''
    lastSentAt = Date.now()

    for (const chunk of chunks) {
      try {
        await config.sendFn({ content: chunk, messageType: 'text' })
      } catch (error) {
        logger.error('Failed to send chunked message', error)
      }
    }
  }

  const start = () => {
    timer = setInterval(flushBuffer, FLUSH_INTERVAL_MS)
  }

  const append = (text: string) => {
    buffer += text
  }

  const flush = async () => {
    await flushBuffer()
  }

  const finish = async () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    // Send remaining buffer
    if (buffer) {
      const chunks = chunkForChannel(buffer, config.channel)
      buffer = ''
      for (const chunk of chunks) {
        try {
          await config.sendFn({ content: chunk, messageType: 'text' })
        } catch (error) {
          logger.error('Failed to send final message', error)
        }
      }
    }
  }

  return { start, append, flush, finish }
}

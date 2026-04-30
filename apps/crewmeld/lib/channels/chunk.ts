/**
 * Message chunking - segment by channel length limits
 */

import type { ConversationChannel } from '@crewmeld/db/schema'
import { t } from '@/lib/core/server-i18n'
import { CHANNEL_MAX_LENGTH } from './types'

/**
 * Segment long text by channel limits
 *
 * Segmentation strategy:
 * 1. Prefer paragraph boundaries (\n\n)
 * 2. Next, sentence boundaries (period/exclamation/question mark/newline)
 * 3. Last resort: force truncate at character limit
 */
export function chunkForChannel(content: string, channel: ConversationChannel): string[] {
  const maxLen = CHANNEL_MAX_LENGTH[channel]

  if (content.length <= maxLen) {
    return [content]
  }

  const chunks: string[] = []
  let remaining = content

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining)
      break
    }

    // Find the best split point within maxLen range
    let splitAt = -1

    // 1. Paragraph boundary
    const paragraphBreak = remaining.lastIndexOf('\n\n', maxLen)
    if (paragraphBreak > maxLen * 0.3) {
      splitAt = paragraphBreak + 2
    }

    // 2. Sentence boundary
    if (splitAt === -1) {
      const cjkBreaks = t('cjkSentenceBreaks', 'zh').split('|')
      const sentenceBreaks = [...cjkBreaks, '.', '!', '?', '\n']
      for (const marker of sentenceBreaks) {
        const pos = remaining.lastIndexOf(marker, maxLen)
        if (pos > maxLen * 0.3) {
          splitAt = pos + marker.length
          break
        }
      }
    }

    // 3. Force truncate
    if (splitAt === -1) {
      splitAt = maxLen
    }

    chunks.push(remaining.slice(0, splitAt).trimEnd())
    remaining = remaining.slice(splitAt).trimStart()
  }

  return chunks
}

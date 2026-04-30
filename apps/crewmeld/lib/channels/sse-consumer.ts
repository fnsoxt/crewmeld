/**
 * SSE stream consumer - extracts full text content and attachments from ReadableStream<Uint8Array>
 *
 * Extracted from the duplicate SSE consumption logic in each channel webhook route.
 * All channels share the same implementation: parses `data: {...}\n\n` format,
 * accumulates the content field from `message:delta` events,
 * collects attachment lists from `message:files` events,
 * and optionally forwards `progress` events to the caller.
 */

import { createLogger } from '@crewmeld/logger'

const logger = createLogger('SSEConsumer')

export interface FileAttachment {
  name: string
  mimeType: string
  base64: string
}

export interface ConsumeResult {
  content: string
  files: FileAttachment[]
}

export interface ConsumeOptions {
  /** Timeout in milliseconds, defaults to 300 seconds */
  timeoutMs?: number
  /** Callback when progress events are received, used to push progress hints to the user */
  onProgress?: (message: string) => void
}

/**
 * Consume an SSE stream, extracting full text content and attachments
 *
 * @param stream  - SSE event stream returned by processMessage()
 * @param optionsOrTimeout - timeout in milliseconds (backward compatible) or options object
 * @returns accumulated text content and attachment list
 */
export async function consumeSSEStream(
  stream: ReadableStream<Uint8Array>,
  optionsOrTimeout?: number | ConsumeOptions
): Promise<ConsumeResult> {
  const options: ConsumeOptions =
    typeof optionsOrTimeout === 'number'
      ? { timeoutMs: optionsOrTimeout }
      : (optionsOrTimeout ?? {})
  const timeoutMs = options.timeoutMs ?? 300_000
  const onProgress = options.onProgress

  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let fullContent = ''
  const files: FileAttachment[] = []
  let buffer = ''
  let errorMessage: string | null = null

  const timeout = setTimeout(() => {
    logger.warn('consumeSSEStream timed out, forcing termination', {
      timeoutMs,
      contentLength: fullContent.length,
    })
    reader.cancel().catch(() => {})
  }, timeoutMs)

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        const remaining = decoder.decode()
        if (remaining) buffer += remaining
        break
      }
      buffer += decoder.decode(value, { stream: true })

      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        const trimmed = part.trim()
        if (!trimmed.startsWith('data: ')) continue
        const jsonStr = trimmed.slice(6)
        if (jsonStr === '[DONE]') continue
        try {
          const evt = JSON.parse(jsonStr)
          if (evt.type === 'message:delta' && evt.data?.content) {
            fullContent += evt.data.content
          } else if (evt.type === 'message:files' && Array.isArray(evt.data?.files)) {
            for (const f of evt.data.files) {
              if (f.name && f.base64) {
                files.push({
                  name: f.name,
                  mimeType: f.mimeType ?? 'application/octet-stream',
                  base64: f.base64,
                })
              }
            }
          } else if (evt.type === 'progress' && evt.data?.message && onProgress) {
            onProgress(evt.data.message as string)
          } else if (evt.type === 'error' && evt.data?.message) {
            errorMessage = evt.data.message as string
          }
        } catch {
          // skip malformed JSON
        }
      }
    }
  } finally {
    clearTimeout(timeout)
    reader.releaseLock()
  }

  // Engine reported an error and produced no usable output: propagate so the
  // webhook handler's catch path can send a friendly error reply to the user.
  if (errorMessage && fullContent === '' && files.length === 0) {
    throw new Error(errorMessage)
  }

  return { content: fullContent, files }
}

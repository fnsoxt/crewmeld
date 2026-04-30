/**
 * Conversation file proxy endpoint — never expires
 *
 * GET /api/employee/conversations/files/{key...}
 *
 * Read file from MinIO by key and return as a stream. Requires login authentication.
 * Key supports multi-segment paths, e.g. conversations/conv-xxx/1711792000_report.pdf
 */

import type { Readable } from 'stream'
import { type NextRequest, NextResponse } from 'next/server'
import { apiErr } from '@/lib/api/response'
import { getSession } from '@/lib/auth'
import { getConversationFile } from '@/lib/conversation/file-storage'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const session = await getSession()
  if (!session?.user) {
    return apiErr('api.common.unauthorized', { status: 401 })
  }

  const { key: keySegments } = await params
  const key = keySegments.join('/')

  // Allow conversations/ and chat/ prefixes (chat/ comes from /api/files/upload context=chat)
  if (!key || (!key.startsWith('conversations/') && !key.startsWith('chat/'))) {
    return apiErr('api.files.invalidFilePath', { status: 400 })
  }

  const file = await getConversationFile(key)
  if (!file) {
    return apiErr('api.files.fileNotFound', { status: 404 })
  }

  // Extract filename from key for Content-Disposition
  const fileName = key.split('/').pop() ?? 'file'
  // Remove timestamp prefix (format: 1711792000_filename.ext)
  const displayName = fileName.replace(/^\d+_/, '')

  // Force download for text/plain to prevent browser rendering GBK as UTF-8
  const isPlainText = file.contentType.startsWith('text/plain')
  const disposition = isPlainText ? 'attachment' : 'inline'

  const headers = new Headers({
    'Content-Type': file.contentType,
    'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(displayName)}`,
    'Cache-Control': 'private, max-age=86400',
  })

  if (file.contentLength > 0) {
    headers.set('Content-Length', String(file.contentLength))
  }

  // Node.js Readable → Web ReadableStream
  const body = file.body
  const stream =
    body instanceof ReadableStream
      ? body
      : new ReadableStream({
          start(controller) {
            const readable = body as NodeJS.ReadableStream
            ;(readable as Readable).on('data', (chunk: Buffer) => controller.enqueue(chunk))
            ;(readable as Readable).on('end', () => controller.close())
            ;(readable as Readable).on('error', (err) => controller.error(err))
          },
        })

  return new NextResponse(stream, { status: 200, headers })
}

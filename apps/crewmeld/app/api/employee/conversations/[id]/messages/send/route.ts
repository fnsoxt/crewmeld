import { createLogger } from '@crewmeld/logger'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiErr } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { getSession } from '@/lib/auth'
import { processMessage } from '@/lib/conversation/engine'
import { getErrorCode } from '@/lib/core/errors'
import { SSE_HEADERS } from '@/lib/core/utils/sse'

const logger = createLogger('ConversationSendAPI')

const FileAttachmentSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(1000)
    .refine((k) => !k.includes('..'), 'Invalid file path'),
  name: z.string().min(1).max(255),
  size: z
    .number()
    .int()
    .min(0)
    .max(50 * 1024 * 1024),
  mimeType: z.string().min(1).max(100),
})

const SendMessageSchema = z.object({
  content: z.string().max(10000),
  files: z.array(FileAttachmentSchema).max(10).optional(),
})

/**
 * POST /api/employee/conversations/[id]/messages/send — Send message + SSE streaming response
 */
async function _POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return apiErr('api.common.unauthorized', { status: 401 })
    }

    const { id: conversationId } = await params
    const body = await request.json()
    const parsed = SendMessageSchema.safeParse(body)

    if (!parsed.success) {
      return apiErr('api.common.invalidParams', { status: 400 })
    }

    // At least one of content or files is required
    if (!parsed.data.content?.trim() && (!parsed.data.files || parsed.data.files.length === 0)) {
      return apiErr('api.conversation.messageEmpty', { status: 400 })
    }

    const stream = await processMessage(
      conversationId,
      parsed.data.content,
      session.user.id,
      parsed.data.files
    )

    return new Response(stream, { headers: SSE_HEADERS })
  } catch (error) {
    logger.error('Failed to send message', error)

    const code = getErrorCode(error)
    if (code === 'CONVERSATION_NOT_FOUND') {
      return apiErr('api.conversation.notFound', { status: 404 })
    }
    if (code === 'CONVERSATION_CLOSED') {
      return apiErr('api.conversation.closed', { status: 400 })
    }

    return apiErr('api.conversation.sendFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)

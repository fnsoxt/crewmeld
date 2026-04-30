import { channelSessions, conversationMessages, conversations, db } from '@crewmeld/db'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { getSession } from '@/lib/auth'
import { deleteConversationFiles } from '@/lib/conversation/file-storage'

const logger = createLogger('ConversationDetailAPI')

/**
 * GET /api/employee/conversations/[id] — Conversation detail
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return apiErr('api.common.unauthorized', { status: 401 })
    }

    const { id } = await params

    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1)

    if (!conv) {
      return apiErr('api.conversation.notFound', { status: 404 })
    }

    return apiOk({
      ...conv,
      lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    })
  } catch (error) {
    logger.error('Failed to fetch conversation detail', error)
    return apiErr('api.conversation.fetchDetailFailed', { status: 500 })
  }
}

/**
 * DELETE /api/employee/conversations/[id] — Close conversation
 */
async function _DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return apiErr('api.common.unauthorized', { status: 401 })
    }

    const { id } = await params

    const [conv] = await db
      .select({ id: conversations.id, status: conversations.status })
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1)

    if (!conv) {
      return apiErr('api.conversation.notFound', { status: 404 })
    }

    // Cascade delete: MinIO files -> messages -> session bindings -> conversation
    const deletedFiles = await deleteConversationFiles(id).catch((err) => {
      logger.warn('MinIO file cleanup failed (not blocking delete)', {
        conversationId: id,
        error: err,
      })
      return 0
    })
    await db.delete(conversationMessages).where(eq(conversationMessages.conversationId, id))
    await db.delete(channelSessions).where(eq(channelSessions.conversationId, id))
    await db.delete(conversations).where(eq(conversations.id, id))

    logger.info(`Conversation deleted: ${id}`, { deletedFiles })

    return apiOk(null, { message: 'api.conversation.deleted' })
  } catch (error) {
    logger.error('Failed to close conversation', error)
    return apiErr('api.conversation.closeFailed', { status: 500 })
  }
}

export const DELETE = withAudit(_DELETE)

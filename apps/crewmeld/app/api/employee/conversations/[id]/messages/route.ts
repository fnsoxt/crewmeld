import { conversationMessages, db } from '@crewmeld/db'
import { createLogger } from '@crewmeld/logger'
import { and, desc, eq, lt } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiErr, apiOk } from '@/lib/api/response'
import { getSession } from '@/lib/auth'

const logger = createLogger('ConversationMessagesAPI')

/**
 * GET /api/employee/conversations/[id]/messages — Message history (cursor pagination)
 *
 * Query params:
 * - limit: page size (default 50, max 100)
 * - before: cursor — return messages before this ID
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return apiErr('api.common.unauthorized', { status: 401 })
    }

    const { id: conversationId } = await params
    const url = new URL(request.url)
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 100)
    const before = url.searchParams.get('before')

    const conditions = [eq(conversationMessages.conversationId, conversationId)]

    if (before) {
      // Find before message createdAt for cursor pagination
      const [cursorMsg] = await db
        .select({ createdAt: conversationMessages.createdAt })
        .from(conversationMessages)
        .where(eq(conversationMessages.id, before))
        .limit(1)

      if (cursorMsg) {
        conditions.push(lt(conversationMessages.createdAt, cursorMsg.createdAt))
      }
    }

    const rows = await db
      .select({
        id: conversationMessages.id,
        role: conversationMessages.role,
        content: conversationMessages.content,
        toolCalls: conversationMessages.toolCalls,
        toolCallId: conversationMessages.toolCallId,
        toolName: conversationMessages.toolName,
        tokensUsed: conversationMessages.tokensUsed,
        metadata: conversationMessages.metadata,
        createdAt: conversationMessages.createdAt,
      })
      .from(conversationMessages)
      .where(and(...conditions))
      .orderBy(desc(conversationMessages.createdAt))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const data = rows
      .slice(0, limit)
      .reverse()
      .map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      }))

    return apiOk(data, {
      extra: {
        hasMore,
        nextCursor: hasMore ? data[0]?.id : null,
      },
    })
  } catch (error) {
    logger.error('Failed to fetch message history', error)
    return apiErr('api.conversation.fetchMessagesFailed', { status: 500 })
  }
}

import {
  channelSessions,
  conversationMessages,
  conversations,
  db,
  digitalEmployees,
  user,
} from '@crewmeld/db'
import { createLogger } from '@crewmeld/logger'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiErr, apiOk } from '@/lib/api/response'
import { getSession } from '@/lib/auth'

const logger = createLogger('ConversationHistoryAPI')

/**
 * GET /api/employee/conversations/history — Cross-channel conversation history for an employee
 *
 * Query params:
 * - employeeId (required): digital employee ID
 * - channel: filter by channel (web | wecom | dingtalk | feishu | api)
 * - limit: result limit (default 50, max 200)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return apiErr('api.common.unauthorized', { status: 401 })
    }

    const url = new URL(request.url)
    const employeeId = url.searchParams.get('employeeId')
    if (!employeeId) {
      return apiErr('api.conversation.missingEmployeeId', { status: 400 })
    }

    const channel = url.searchParams.get('channel')
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
    const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0)

    // Verify employee exists
    const [employee] = await db
      .select({
        id: digitalEmployees.id,
        name: digitalEmployees.name,
        avatar: digitalEmployees.avatar,
      })
      .from(digitalEmployees)
      .where(eq(digitalEmployees.id, employeeId))
      .limit(1)

    if (!employee) {
      return apiErr('api.employee.notFound', { status: 404 })
    }

    // Build query conditions
    const conditions = [
      eq(conversations.employeeId, employeeId),
      sql`${conversations.messageCount} > 0`,
    ]
    if (
      channel === 'web' ||
      channel === 'wecom' ||
      channel === 'dingtalk' ||
      channel === 'feishu' ||
      channel === 'api' ||
      channel === 'wxoa'
    ) {
      conditions.push(eq(conversations.channel, channel))
    }

    // Query conversations, left join channelSessions for external channel info, left join user for Web username
    const rows = await db
      .select({
        id: conversations.id,
        employeeId: conversations.employeeId,
        userId: conversations.userId,
        channel: conversations.channel,
        status: conversations.status,
        title: conversations.title,
        messageCount: conversations.messageCount,
        totalTokens: conversations.totalTokens,
        lastMessageAt: conversations.lastMessageAt,
        createdAt: conversations.createdAt,
        metadata: conversations.metadata,
        externalUserId: channelSessions.externalUserId,
        externalSessionId: channelSessions.externalSessionId,
        channelMetadata: channelSessions.metadata,
        userName: user.name,
      })
      .from(conversations)
      .leftJoin(channelSessions, eq(conversations.id, channelSessions.conversationId))
      .leftJoin(user, eq(conversations.userId, user.id))
      .where(and(...conditions))
      .orderBy(desc(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`))
      .offset(offset)
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const pagedRows = rows.slice(0, limit)

    // Get latest user message as preview for each conversation, count visible messages (user + assistant)
    const conversationIds = pagedRows.map((r) => r.id)
    const previews: Record<string, string> = {}
    const visibleCounts: Record<string, number> = {}
    if (conversationIds.length > 0) {
      const inClause = sql`${conversationMessages.conversationId} IN (${sql.join(
        conversationIds.map((id) => sql`${id}`),
        sql`, `
      )})`

      const [previewRows, countRows] = await Promise.all([
        db
          .select({
            conversationId: conversationMessages.conversationId,
            content: conversationMessages.content,
          })
          .from(conversationMessages)
          .where(and(inClause, eq(conversationMessages.role, 'user')))
          .orderBy(desc(conversationMessages.createdAt)),
        db
          .select({
            conversationId: conversationMessages.conversationId,
            count: sql<number>`count(*)::int`,
          })
          .from(conversationMessages)
          .where(
            and(
              inClause,
              sql`${conversationMessages.role} IN ('user', 'assistant')`,
              sql`${conversationMessages.content} IS NOT NULL AND ${conversationMessages.content} != ''`
            )
          )
          .groupBy(conversationMessages.conversationId),
      ])

      // Take only first entry per conversation (latest user message)
      for (const row of previewRows) {
        if (!previews[row.conversationId]) {
          previews[row.conversationId] = row.content?.slice(0, 100) ?? ''
        }
      }
      for (const row of countRows) {
        visibleCounts[row.conversationId] = row.count
      }
    }

    const data = pagedRows.map((row) => {
      const meta = row.metadata as Record<string, unknown> | null
      // Prefer metadata.senderName, fall back to user table name (covers legacy Web conversations)
      const senderName = (meta?.senderName as string) ?? row.userName ?? null
      return {
        id: row.id,
        employeeId: row.employeeId,
        userId: row.userId,
        channel: row.channel,
        status: row.status,
        title: row.title,
        messageCount: visibleCounts[row.id] ?? 0,
        totalTokens: row.totalTokens,
        lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        externalUserId: row.externalUserId ?? null,
        externalSessionId: row.externalSessionId ?? null,
        channelMetadata: row.channelMetadata ?? null,
        senderName,
        preview: previews[row.id] ?? null,
      }
    })

    // Channel-grouped stats (independent full query, not affected by channel filter or limit)
    const allChannelRows = await db
      .select({
        channel: conversations.channel,
        count: sql<number>`count(*)::int`,
      })
      .from(conversations)
      .where(and(eq(conversations.employeeId, employeeId), sql`${conversations.messageCount} > 0`))
      .groupBy(conversations.channel)

    const channelStats: Record<string, number> = {}
    for (const row of allChannelRows) {
      channelStats[row.channel] = row.count
    }

    return apiOk(data, {
      extra: {
        employee: { id: employee.id, name: employee.name, avatar: employee.avatar },
        channelStats,
        total: data.length,
        hasMore,
      },
    })
  } catch (error) {
    logger.error('Failed to fetch conversation history', error)
    return apiErr('api.conversation.fetchHistoryFailed', { status: 500 })
  }
}

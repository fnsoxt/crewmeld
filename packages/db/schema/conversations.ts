import { index, integer, jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { digitalEmployees } from './employee'

/**
 * Conversation status enum
 */
export const conversationStatusEnum = pgEnum('conversation_status', [
  'active',
  'closed',
  'archived',
])

export type ConversationStatus = (typeof conversationStatusEnum.enumValues)[number]

/**
 * Conversation channel enum
 */
export const conversationChannelEnum = pgEnum('conversation_channel', [
  'web',
  'wecom',
  'dingtalk',
  'feishu',
  'discord',
  'telegram',
  'api',
  'wxoa',
  'email',
])

export type ConversationChannel = (typeof conversationChannelEnum.enumValues)[number]

/**
 * Message role enum
 */
export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant', 'system', 'tool'])

export type MessageRole = (typeof messageRoleEnum.enumValues)[number]

/**
 * Conversations table — records a complete human-machine conversation session
 */
export const conversations = pgTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => digitalEmployees.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    workspaceId: text('workspace_id').notNull(),
    channel: conversationChannelEnum('channel').notNull().default('web'),
    status: conversationStatusEnum('status').notNull().default('active'),
    title: text('title'),
    messageCount: integer('message_count').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    employeeIdIdx: index('conversations_employee_id_idx').on(table.employeeId),
    userIdIdx: index('conversations_user_id_idx').on(table.userId),
    statusIdx: index('conversations_status_idx').on(table.status),
    channelIdx: index('conversations_channel_idx').on(table.channel),
    lastMessageAtIdx: index('conversations_last_message_at_idx').on(table.lastMessageAt),
  })
)

/**
 * Conversation messages table — stores each message (user input / assistant reply / tool call result)
 */
export const conversationMessages = pgTable(
  'conversation_messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: messageRoleEnum('role').notNull(),
    content: text('content'),
    toolCalls: jsonb('tool_calls'),
    toolCallId: text('tool_call_id'),
    toolName: text('tool_name'),
    tokensUsed: integer('tokens_used').notNull().default(0),
    metadata: jsonb('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    conversationIdIdx: index('conv_messages_conversation_id_idx').on(table.conversationId),
    roleIdx: index('conv_messages_role_idx').on(table.role),
    createdAtIdx: index('conv_messages_created_at_idx').on(table.createdAt),
  })
)

/**
 * Channel session mapping table — binds IM channel external session IDs to internal conversation IDs
 */
export const channelSessions = pgTable(
  'channel_sessions',
  {
    id: text('id').primaryKey(),
    channel: conversationChannelEnum('channel').notNull(),
    externalUserId: text('external_user_id').notNull(),
    externalSessionId: text('external_session_id'),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => digitalEmployees.id, { onDelete: 'cascade' }),
    metadata: jsonb('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    channelExternalUserIdx: index('channel_sessions_channel_user_idx').on(
      table.channel,
      table.externalUserId
    ),
    conversationIdIdx: index('channel_sessions_conversation_id_idx').on(table.conversationId),
    employeeIdIdx: index('channel_sessions_employee_id_idx').on(table.employeeId),
  })
)

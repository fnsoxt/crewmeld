import { db } from '@crewmeld/db'
import { channelSessions, conversations } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { v4 as uuidv4 } from 'uuid'
import { consumeSSEStream } from '@/lib/channels/sse-consumer'
import { processMessage } from '@/lib/conversation/engine'
import { uploadConversationFile } from '@/lib/conversation/file-storage'
import { t } from '@/lib/core/server-i18n'

interface ImapAttachment {
  name: string
  data: Buffer
  mimeType: string
  size: number
}

export interface SimplifiedImapEmail {
  uid: string
  messageId: string
  subject: string
  from: string
  to: string
  cc: string
  date: string | null
  bodyText: string
  bodyHtml: string
  mailbox: string
  hasAttachments: boolean
  attachments: ImapAttachment[]
}

const logger = createLogger('ImapConversationHandler')

/**
 * Route an IMAP email to a digital employee conversation
 *
 * - Each email creates an independent conversation
 * - Uses sender email as userId, email messageId as externalSessionId
 * - Feeds the email body (including attachments) as a user message into the conversation engine
 */
export async function handleImapEmailAsConversation(
  email: SimplifiedImapEmail,
  employeeId: string
): Promise<void> {
  const senderEmail = email.from?.match(/<([^>]+)>/)?.[1] ?? email.from

  if (!senderEmail) {
    logger.warn('Email missing sender address, skipping', { subject: email.subject })
    return
  }

  // Create an independent conversation for each email
  const conversationId = uuidv4()
  await db.insert(conversations).values({
    id: conversationId,
    employeeId,
    userId: senderEmail,
    workspaceId: 'default',
    channel: 'email',
    title: email.subject && email.subject !== '[No Subject]' ? email.subject : undefined,
  })
  await db.insert(channelSessions).values({
    id: uuidv4(),
    channel: 'email',
    externalUserId: senderEmail,
    externalSessionId: email.messageId || email.uid,
    conversationId,
    employeeId,
  })

  logger.info('New conversation created', { conversationId, senderEmail, subject: email.subject })

  // Assemble message content: subject + body
  const subject =
    email.subject && email.subject !== '[No Subject]'
      ? `${t('channelImapSubjectPrefix', 'zh', { name: email.subject })}\n\n`
      : ''
  const body = email.bodyText?.trim() || email.bodyHtml?.replace(/<[^>]+>/g, '').trim() || ''
  const content = subject + (body || `(${t('channelImapNoBody')})`)

  // Upload attachments
  const fileMetadata = []
  for (const attachment of email.attachments ?? []) {
    try {
      const file = await uploadConversationFile(
        conversationId,
        attachment.name,
        attachment.data,
        attachment.mimeType
      )
      fileMetadata.push(file)
    } catch (err) {
      logger.warn('Attachment upload failed, skipping', { name: attachment.name, err })
    }
  }

  // Call conversation engine to process message
  try {
    const stream = await processMessage(
      conversationId,
      content,
      senderEmail,
      fileMetadata.length > 0 ? fileMetadata : undefined
    )
    // Consume SSE stream to complete processing, results are auto-saved to DB
    await consumeSSEStream(stream, {})
  } catch (err) {
    logger.error('Conversation engine processing failed', { conversationId, senderEmail, err })
    throw err
  }
}

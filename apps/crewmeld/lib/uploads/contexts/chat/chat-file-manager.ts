import { createLogger } from '@crewmeld/logger'
import { processExecutionFiles } from '@/lib/execution/files'
import type { UserFile } from '@/lib/types/execution'

const logger = createLogger('ChatFileManager')

// ─── types ───────────────────────────────────────────────────────────────────

/**
 * A single file attachment submitted with a chat message.
 *
 * - `dataUrl` / `data` carry base64-encoded content for newly uploaded files.
 * - `url` is a pass-through reference to an already-stored file.
 */
export interface ChatFile {
  /** Preferred field: base64 data URL (`data:<mime>;base64,...`). */
  dataUrl?: string
  /** Legacy field: raw base64 or data URL. */
  data?: string
  /** Direct URL to an existing stored file (pass-through). */
  url?: string
  /** Original filename. */
  name: string
  /** MIME type. */
  type: string
}

/** Execution-scope identifiers used for temporary file storage. */
export interface ChatExecutionContext {
  workspaceId: string
  workflowId: string
  executionId: string
}

// ─── internal helpers ────────────────────────────────────────────────────────

/**
 * Normalise a `ChatFile` into the shape expected by `processExecutionFiles`.
 * Inline data (dataUrl / data) maps to type `'file'`; URL references map to `'url'`.
 */
function normaliseChatFile(file: ChatFile): {
  type: 'file' | 'url'
  data: string
  name: string
  mime: string
} {
  const inlineData = file.dataUrl ?? file.data

  return {
    type: inlineData ? 'file' : 'url',
    data: inlineData ?? file.url ?? '',
    name: file.name,
    mime: file.type,
  }
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Process and upload chat file attachments to temporary execution storage.
 *
 * Handles two input formats:
 * - **Base64 dataUrl** — file content uploaded from the client.
 * - **Direct URL** — pass-through reference to an already-stored file.
 *
 * Files are stored in the execution context with a 5–10 minute expiry.
 *
 * @param files - Array of chat file attachments to process
 * @param executionContext - Execution scope for temporary storage
 * @param requestId - Unique request identifier for logging/tracing
 * @param userId - Optional user ID stored in file metadata
 * @returns Array of `UserFile` objects with upload results
 */
export async function processChatFiles(
  files: ChatFile[],
  executionContext: ChatExecutionContext,
  requestId: string,
  userId?: string
): Promise<UserFile[]> {
  logger.info(
    `Processing ${files.length} chat files for execution ${executionContext.executionId}`,
    { requestId, executionContext }
  )

  const normalisedFiles = files.map(normaliseChatFile)

  const userFiles = await processExecutionFiles(
    normalisedFiles,
    executionContext,
    requestId,
    userId
  )

  logger.info(`Successfully processed ${userFiles.length} chat files`, {
    requestId,
    executionId: executionContext.executionId,
  })

  return userFiles
}

/**
 * Upload a single chat file to temporary execution storage.
 *
 * Convenience wrapper around {@link processChatFiles}.
 * For batch uploads prefer `processChatFiles` directly.
 *
 * @param file - Chat file to upload
 * @param executionContext - Execution scope for temporary storage
 * @param requestId - Unique request identifier
 * @param userId - Optional user ID stored in file metadata
 * @returns `UserFile` object with upload result
 */
export async function uploadChatFile(
  file: ChatFile,
  executionContext: ChatExecutionContext,
  requestId: string,
  userId?: string
): Promise<UserFile> {
  const [userFile] = await processChatFiles([file], executionContext, requestId, userId)
  return userFile
}

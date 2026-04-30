import { createLogger } from '@crewmeld/logger'
import { isUserFileWithMetadata } from '@/lib/core/utils/user-file'
import type { UserFile } from '@/lib/types/execution'
import { StorageService } from '@/lib/uploads'
import type { ExecutionContext } from '@/lib/uploads/contexts/execution/utils'
import { generateExecutionFileKey, generateFileId } from '@/lib/uploads/contexts/execution/utils'

const logger = createLogger('ExecutionFileStorage')

// ─── internal helpers ────────────────────────────────────────────────────────

/** Return `true` when `value` looks like a Node.js serialised `Buffer`. */
function isSerializedBuffer(value: unknown): value is { type: string; data: number[] } {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'Buffer' &&
    Array.isArray((value as { data?: unknown }).data)
  )
}

/**
 * Convert a heterogeneous raw data value into a `Buffer`.
 * Supports: Buffer, serialised Buffer, ArrayBuffer, TypedArray, number[], base64 string,
 * and data-URL strings.
 *
 * @throws When the data cannot be converted.
 */
function coerceToBuffer(data: unknown, fileName: string): Buffer {
  if (data === undefined || data === null) {
    throw new Error(`File '${fileName}' has no data`)
  }

  if (Buffer.isBuffer(data)) return data
  if (isSerializedBuffer(data)) return Buffer.from(data.data)
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  if (Array.isArray(data)) return Buffer.from(data)

  if (typeof data === 'string') {
    const trimmed = data.trim()
    if (trimmed.startsWith('data:')) {
      const base64Part = trimmed.split(',')[1] ?? ''
      return Buffer.from(base64Part, 'base64')
    }
    return Buffer.from(trimmed, 'base64')
  }

  throw new Error(`File '${fileName}' has unsupported data format: ${typeof data}`)
}

/** Build the metadata record stored alongside an execution file. */
function buildExecutionMetadata(
  context: ExecutionContext,
  fileName: string,
  userId?: string
): Record<string, string> {
  const meta: Record<string, string> = {
    originalName: fileName,
    uploadedAt: new Date().toISOString(),
    purpose: 'execution',
    workspaceId: context.workspaceId,
  }

  if (userId) {
    meta.userId = userId
  }

  return meta
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Upload a file buffer to execution-scoped storage and return a `UserFile`
 * descriptor with a short-lived presigned download URL pre-populated.
 */
export async function uploadExecutionFile(
  context: ExecutionContext,
  fileBuffer: Buffer,
  fileName: string,
  contentType: string,
  userId?: string
): Promise<UserFile> {
  logger.info(`Uploading execution file: ${fileName} for execution ${context.executionId}`)
  logger.debug('File upload context:', {
    workspaceId: context.workspaceId,
    workflowId: context.workflowId,
    executionId: context.executionId,
    userId: userId ?? 'not provided',
    fileName,
    bufferSize: fileBuffer.length,
  })

  const storageKey = generateExecutionFileKey(context, fileName)
  const fileId = generateFileId()
  const metadata = buildExecutionMetadata(context, fileName, userId)

  logger.info(`Generated storage key: "${storageKey}" for file: ${fileName}`)

  try {
    const fileInfo = await StorageService.uploadFile({
      file: fileBuffer,
      fileName: storageKey,
      contentType,
      context: 'execution',
      preserveKey: true,
      customKey: storageKey,
      metadata,
    })

    const presignedUrl = await StorageService.generatePresignedDownloadUrl(
      fileInfo.key,
      'execution',
      5 * 60
    )

    const userFile: UserFile = {
      id: fileId,
      name: fileName,
      size: fileBuffer.length,
      type: contentType,
      url: presignedUrl,
      key: fileInfo.key,
      context: 'execution',
      base64: fileBuffer.toString('base64'),
    }

    logger.info(`Successfully uploaded execution file: ${fileName} (${fileBuffer.length} bytes)`, {
      key: fileInfo.key,
    })

    return userFile
  } catch (error) {
    logger.error(`Failed to upload execution file ${fileName}:`, error)
    throw new Error(
      `Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Download the raw bytes of an execution-scoped file from storage.
 */
export async function downloadExecutionFile(userFile: UserFile): Promise<Buffer> {
  logger.info(`Downloading execution file: ${userFile.name}`)

  try {
    const buffer = await StorageService.downloadFile({
      key: userFile.key,
      context: 'execution',
    })

    logger.info(`Successfully downloaded execution file: ${userFile.name} (${buffer.length} bytes)`)

    return buffer
  } catch (error) {
    logger.error(`Failed to download execution file ${userFile.name}:`, error)
    throw new Error(
      `Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Accept raw file data in any supported format, convert it to a `Buffer`, and
 * upload it to execution storage.  Pass-through when the input is already a
 * complete `UserFile`.
 */
export async function uploadFileFromRawData(
  rawData: {
    name?: string
    filename?: string
    data?: unknown
    mimeType?: string
    contentType?: string
    size?: number
  },
  context: ExecutionContext,
  userId?: string
): Promise<UserFile> {
  if (isUserFileWithMetadata(rawData)) {
    return rawData
  }

  const fileName = rawData.name ?? rawData.filename ?? 'file.bin'
  const buffer = coerceToBuffer(rawData.data, fileName)
  const contentType = rawData.mimeType ?? rawData.contentType ?? 'application/octet-stream'

  return uploadExecutionFile(context, buffer, fileName, contentType, userId)
}

import { createLogger } from '@crewmeld/logger'
import { getStorageConfig, USE_S3_STORAGE } from '@/lib/uploads/config'
import type { S3Config } from '@/lib/uploads/providers/s3/types'
import type {
  DeleteFileOptions,
  DownloadFileOptions,
  FileInfo,
  GeneratePresignedUrlOptions,
  PresignedUrlResponse,
  StorageConfig,
  StorageContext,
  UploadFileOptions,
} from '@/lib/uploads/shared/types'
import {
  sanitizeFileKey,
  sanitizeFilenameForMetadata,
  sanitizeStorageMetadata,
} from '@/lib/uploads/utils/file-utils'

const logger = createLogger('StorageService')

// ─── internal helpers ────────────────────────────────────────────────────────

/**
 * Validate that a `StorageConfig` has both `bucket` and `region`, then cast
 * it to `S3Config`.  Throws when either field is absent.
 */
function requireS3Config(config: StorageConfig): S3Config {
  if (!config.bucket || !config.region) {
    throw new Error('S3 configuration is missing required properties: bucket and region')
  }
  return { bucket: config.bucket, region: config.region }
}

/**
 * Persist file metadata to the `workspaceFiles` table via a dynamic import
 * to avoid circular dependency issues at module load time.
 */
async function persistFileMetadata(
  key: string,
  metadata: Record<string, string>,
  context: StorageContext,
  fileName: string,
  contentType: string,
  fileSize: number
): Promise<void> {
  const { insertFileMetadata } = await import('../server/metadata')
  await insertFileMetadata({
    key,
    userId: metadata.userId,
    workspaceId: metadata.workspaceId || null,
    context,
    originalName: metadata.originalName || fileName,
    contentType,
    size: fileSize,
  })
}

// ─── upload ──────────────────────────────────────────────────────────────────

/**
 * Upload a file to the configured storage provider using context-aware bucket
 * selection.  Writes to S3 when `USE_S3_STORAGE` is set; falls back to the
 * local filesystem otherwise.
 */
export async function uploadFile(options: UploadFileOptions): Promise<FileInfo> {
  const { file, fileName, contentType, context, preserveKey, customKey, metadata } = options

  logger.info(`Uploading file to ${context} storage: ${fileName}`)

  const storageConfig = getStorageConfig(context)
  const effectiveKey = customKey || fileName

  if (USE_S3_STORAGE) {
    const { uploadToS3 } = await import('@/lib/uploads/providers/s3/client')

    const uploadResult = await uploadToS3(
      file,
      effectiveKey,
      contentType,
      requireS3Config(storageConfig),
      file.length,
      preserveKey,
      metadata
    )

    if (metadata) {
      await persistFileMetadata(
        uploadResult.key,
        metadata,
        context,
        fileName,
        contentType,
        file.length
      )
    }

    return uploadResult
  }

  // ── local filesystem fallback ──
  const { writeFile, mkdir } = await import('fs/promises')
  const { join, dirname } = await import('path')
  const { UPLOAD_DIR_SERVER } = await import('./setup.server')

  const safeKey = sanitizeFileKey(effectiveKey)
  const filesystemPath = join(UPLOAD_DIR_SERVER, safeKey)

  await mkdir(dirname(filesystemPath), { recursive: true })
  await writeFile(filesystemPath, file)

  if (metadata) {
    await persistFileMetadata(effectiveKey, metadata, context, fileName, contentType, file.length)
  }

  return {
    path: `/api/files/serve/${effectiveKey}`,
    key: effectiveKey,
    name: fileName,
    size: file.length,
    type: contentType,
  }
}

// ─── download ────────────────────────────────────────────────────────────────

/**
 * Download a file from the configured storage provider.
 */
export async function downloadFile(options: DownloadFileOptions): Promise<Buffer> {
  const { key, context } = options

  if (context && USE_S3_STORAGE) {
    const { downloadFromS3 } = await import('@/lib/uploads/providers/s3/client')
    const config = getStorageConfig(context)
    return downloadFromS3(key, requireS3Config(config))
  }

  const { readFile } = await import('fs/promises')
  const { join } = await import('path')
  const { UPLOAD_DIR_SERVER } = await import('./setup.server')

  const safeKey = sanitizeFileKey(key)
  return readFile(join(UPLOAD_DIR_SERVER, safeKey))
}

// ─── delete ──────────────────────────────────────────────────────────────────

/**
 * Delete a file from the configured storage provider.
 */
export async function deleteFile(options: DeleteFileOptions): Promise<void> {
  const { key, context } = options

  if (context && USE_S3_STORAGE) {
    const { deleteFromS3 } = await import('@/lib/uploads/providers/s3/client')
    const config = getStorageConfig(context)
    return deleteFromS3(key, requireS3Config(config))
  }

  const { unlink } = await import('fs/promises')
  const { join } = await import('path')
  const { UPLOAD_DIR_SERVER } = await import('./setup.server')

  const safeKey = sanitizeFileKey(key)
  await unlink(join(UPLOAD_DIR_SERVER, safeKey))
}

// ─── presigned URLs ──────────────────────────────────────────────────────────

/**
 * Derive a unique storage key for a presigned upload, incorporating context
 * prefix, timestamp, random suffix, and sanitised filename.
 */
function buildPresignedKey(context: StorageContext, fileName: string): string {
  const timestamp = Date.now()
  const randomSuffix = Math.random().toString(36).substring(2, 9)
  const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  return `${context}/${timestamp}-${randomSuffix}-${safeFileName}`
}

/**
 * Generate a presigned S3 PUT URL for a given key, content-type, and metadata.
 */
async function createS3PresignedPutUrl(
  key: string,
  contentType: string,
  fileSize: number,
  metadata: Record<string, string>,
  config: { bucket?: string; region?: string },
  expirationSeconds: number
): Promise<PresignedUrlResponse> {
  const { getS3Client } = await import('@/lib/uploads/providers/s3/client')
  const { PutObjectCommand } = await import('@aws-sdk/client-s3')
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')

  if (!config.bucket || !config.region) {
    throw new Error('S3 configuration missing bucket or region')
  }

  const sanitisedMetadata = sanitizeStorageMetadata(metadata, 2000)
  if (sanitisedMetadata.originalName) {
    sanitisedMetadata.originalName = sanitizeFilenameForMetadata(sanitisedMetadata.originalName)
  }

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: fileSize,
    Metadata: sanitisedMetadata,
  })

  const presignedUrl = await getSignedUrl(getS3Client(), command, { expiresIn: expirationSeconds })

  return { url: presignedUrl, key }
}

/**
 * Generate a presigned URL for a direct client-to-S3 upload.
 * Throws when cloud storage is not configured (local storage has no presign support).
 */
export async function generatePresignedUploadUrl(
  options: GeneratePresignedUrlOptions
): Promise<PresignedUrlResponse> {
  const {
    fileName,
    contentType,
    fileSize,
    context,
    userId,
    expirationSeconds = 3600,
    metadata = {},
  } = options

  const enrichedMetadata: Record<string, string> = {
    ...metadata,
    originalName: fileName,
    uploadedAt: new Date().toISOString(),
    purpose: context,
    ...(userId ? { userId } : {}),
  }

  const config = getStorageConfig(context)
  const key = buildPresignedKey(context, fileName)

  if (USE_S3_STORAGE) {
    return createS3PresignedPutUrl(
      key,
      contentType,
      fileSize,
      enrichedMetadata,
      config,
      expirationSeconds
    )
  }

  throw new Error('Cloud storage not configured. Cannot generate presigned URL for local storage.')
}

/**
 * Generate presigned upload URLs for a batch of files in the same context.
 */
export async function generateBatchPresignedUploadUrls(
  files: Array<{ fileName: string; contentType: string; fileSize: number }>,
  context: StorageContext,
  userId?: string,
  expirationSeconds?: number
): Promise<PresignedUrlResponse[]> {
  const results: PresignedUrlResponse[] = []

  for (const file of files) {
    const result = await generatePresignedUploadUrl({
      fileName: file.fileName,
      contentType: file.contentType,
      fileSize: file.fileSize,
      context,
      userId,
      expirationSeconds,
    })
    results.push(result)
  }

  return results
}

/**
 * Generate a presigned GET URL for downloading an already-stored file.
 * Falls back to a local serve URL when cloud storage is not active.
 */
export async function generatePresignedDownloadUrl(
  key: string,
  context: StorageContext,
  expirationSeconds = 3600
): Promise<string> {
  if (USE_S3_STORAGE) {
    const { getPresignedUrlWithConfig } = await import('@/lib/uploads/providers/s3/client')
    const config = getStorageConfig(context)
    return getPresignedUrlWithConfig(key, requireS3Config(config), expirationSeconds)
  }

  const { getBaseUrl } = await import('@/lib/core/utils/urls')
  return `${getBaseUrl()}/api/files/serve/${encodeURIComponent(key)}`
}

// ─── introspection helpers ───────────────────────────────────────────────────

/** Return `true` when S3-compatible cloud storage is active. */
export function hasCloudStorage(): boolean {
  return USE_S3_STORAGE
}

/**
 * Return the S3 bucket and key for a given storage key and context.
 * Useful for services that need direct S3 access (e.g. AWS Textract async jobs).
 *
 * @throws When S3 storage is not configured, or the context has no bucket.
 */
export function getS3InfoForKey(
  key: string,
  context: StorageContext
): { bucket: string; key: string } {
  if (!USE_S3_STORAGE) {
    throw new Error('S3 storage is not configured. Cannot retrieve S3 info for key.')
  }

  const config = getStorageConfig(context)

  if (!config.bucket) {
    throw new Error(`S3 bucket not configured for context: ${context}`)
  }

  return { bucket: config.bucket, key }
}

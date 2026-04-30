import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '@/lib/core/config/env'
import { sanitizeFileName } from '@/lib/types/execution-constants'
import { S3_CONFIG, S3_KB_CONFIG } from '@/lib/uploads/config'
import type {
  S3Config,
  S3MultipartPart,
  S3MultipartUploadInit,
  S3PartUploadUrl,
} from '@/lib/uploads/providers/s3/types'
import type { FileInfo } from '@/lib/uploads/shared/types'
import {
  sanitizeFilenameForMetadata,
  sanitizeStorageMetadata,
} from '@/lib/uploads/utils/file-utils'

// ─── singleton client ────────────────────────────────────────────────────────

let _clientSingleton: S3Client | null = null

/**
 * Build the credential block from environment variables.
 * Returns undefined when either key is absent so the SDK falls back to
 * its default credential provider chain (IAM roles, instance metadata, etc.).
 */
function buildCredentials(): { accessKeyId: string; secretAccessKey: string } | undefined {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = env
  if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
    return { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY }
  }
  return undefined
}

/**
 * Return (or lazily create) the shared S3Client instance.
 * Throws when AWS_REGION is not configured.
 */
export function getS3Client(): S3Client {
  if (_clientSingleton) {
    return _clientSingleton
  }

  const region = S3_CONFIG.region
  if (!region) {
    throw new Error(
      'AWS region is missing — set AWS_REGION in your environment or disable S3 uploads.'
    )
  }

  _clientSingleton = new S3Client({
    region,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE ?? !!env.S3_ENDPOINT,
    credentials: buildCredentials(),
  })

  return _clientSingleton
}

// ─── upload ──────────────────────────────────────────────────────────────────

/**
 * Assemble the S3 metadata record that accompanies every upload.
 * Extra user-supplied metadata is sanitised and merged in.
 */
function buildObjectMetadata(
  originalName: string,
  extra?: Record<string, string>
): Record<string, string> {
  const base: Record<string, string> = {
    originalName: sanitizeFilenameForMetadata(originalName),
    uploadedAt: new Date().toISOString(),
  }

  if (extra) {
    const sanitised = sanitizeStorageMetadata(extra, 2000)
    Object.assign(base, sanitised)
  }

  return base
}

/**
 * Derive the storage key, optionally prefixed with a millisecond timestamp.
 */
function deriveStorageKey(fileName: string, skipTimestampPrefix: boolean): string {
  const safe = sanitizeFileName(fileName)
  return skipTimestampPrefix ? fileName : `${Date.now()}-${safe}`
}

/**
 * Resolve the target S3Config and effective file size from the overloaded
 * `configOrSize` parameter accepted by {@link uploadToS3}.
 */
function resolveUploadParams(
  file: Buffer,
  configOrSize?: S3Config | number,
  size?: number,
  skipTimestampPrefix?: boolean
): { config: S3Config; fileSize: number; shouldSkipTimestamp: boolean } {
  if (typeof configOrSize === 'object') {
    return {
      config: configOrSize,
      fileSize: size ?? file.length,
      shouldSkipTimestamp: skipTimestampPrefix ?? false,
    }
  }

  return {
    config: { bucket: S3_CONFIG.bucket, region: S3_CONFIG.region },
    fileSize: configOrSize ?? file.length,
    shouldSkipTimestamp: skipTimestampPrefix ?? false,
  }
}

/**
 * Upload a file to S3 using `PutObjectCommand`.
 *
 * @param file - Buffer containing file data
 * @param fileName - Original file name
 * @param contentType - MIME type of the file
 * @param configOrSize - Custom S3Config **or** file size in bytes (optional)
 * @param size - File size in bytes (required when configOrSize is S3Config)
 * @param skipTimestampPrefix - Skip adding timestamp prefix to filename
 * @param metadata - Optional metadata stored alongside the object
 * @returns FileInfo describing the uploaded object
 */
export async function uploadToS3(
  file: Buffer,
  fileName: string,
  contentType: string,
  configOrSize?: S3Config | number,
  size?: number,
  skipTimestampPrefix?: boolean,
  metadata?: Record<string, string>
): Promise<FileInfo> {
  const { config, fileSize, shouldSkipTimestamp } = resolveUploadParams(
    file,
    configOrSize,
    size,
    skipTimestampPrefix
  )

  const key = deriveStorageKey(fileName, shouldSkipTimestamp)
  const objectMetadata = buildObjectMetadata(fileName, metadata)

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: file,
      ContentType: contentType,
      Metadata: objectMetadata,
    })
  )

  return {
    path: `/api/files/serve/${encodeURIComponent(key)}`,
    key,
    name: fileName,
    size: fileSize,
    type: contentType,
  }
}

// ─── presigned URLs ──────────────────────────────────────────────────────────

/**
 * Generate a presigned GET URL for a stored object using the default bucket.
 *
 * @param key - S3 object key
 * @param expiresIn - URL lifetime in seconds (default 3600)
 */
export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: S3_CONFIG.bucket,
    Key: key,
  })

  return getSignedUrl(getS3Client(), command, { expiresIn })
}

/**
 * Generate a presigned GET URL using a caller-supplied S3Config.
 *
 * @param key - S3 object key
 * @param customConfig - Bucket/region override
 * @param expiresIn - URL lifetime in seconds (default 3600)
 */
export async function getPresignedUrlWithConfig(
  key: string,
  customConfig: S3Config,
  expiresIn = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: customConfig.bucket,
    Key: key,
  })

  return getSignedUrl(getS3Client(), command, { expiresIn })
}

// ─── download ────────────────────────────────────────────────────────────────

/**
 * Collect a readable stream into a Buffer.
 */
function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

/**
 * Download a file from S3.
 *
 * @param key - S3 object key
 * @param customConfig - Optional bucket/region override
 */
export async function downloadFromS3(key: string, customConfig?: S3Config): Promise<Buffer> {
  const targetBucket = customConfig?.bucket ?? S3_CONFIG.bucket

  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: targetBucket,
      Key: key,
    })
  )

  return streamToBuffer(response.Body as NodeJS.ReadableStream)
}

// ─── delete ──────────────────────────────────────────────────────────────────

/**
 * Delete an object from S3.
 *
 * @param key - S3 object key
 * @param customConfig - Optional bucket/region override
 */
export async function deleteFromS3(key: string, customConfig?: S3Config): Promise<void> {
  const targetBucket = customConfig?.bucket ?? S3_CONFIG.bucket

  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: targetBucket,
      Key: key,
    })
  )
}

// ─── head (metadata) ─────────────────────────────────────────────────────────

/**
 * Fetch S3 object metadata without downloading the body.
 *
 * @param key - S3 object key
 * @param bucket - Target bucket (defaults to S3_CONFIG.bucket)
 */
export async function headObject(key: string, bucket?: string): Promise<Record<string, string>> {
  const targetBucket = bucket ?? S3_CONFIG.bucket

  const response = await getS3Client().send(
    new HeadObjectCommand({
      Bucket: targetBucket,
      Key: key,
    })
  )

  return response.Metadata ?? {}
}

// ─── multipart upload ────────────────────────────────────────────────────────

/**
 * Initiate a multipart upload session and return the upload ID + storage key.
 *
 * @param options - File name, content-type, size, and optional bucket config
 */
export async function initiateS3MultipartUpload(
  options: S3MultipartUploadInit
): Promise<{ uploadId: string; key: string }> {
  const { fileName, contentType, customConfig } = options
  const targetConfig = customConfig ?? {
    bucket: S3_KB_CONFIG.bucket,
    region: S3_KB_CONFIG.region,
  }

  const { v4: uuidv4 } = await import('uuid')
  const safeFileName = sanitizeFileName(fileName)
  const uniqueKey = `kb/${uuidv4()}-${safeFileName}`

  const response = await getS3Client().send(
    new CreateMultipartUploadCommand({
      Bucket: targetConfig.bucket,
      Key: uniqueKey,
      ContentType: contentType,
      Metadata: {
        originalName: sanitizeFilenameForMetadata(fileName),
        uploadedAt: new Date().toISOString(),
        purpose: 'knowledge-base',
      },
    })
  )

  if (!response.UploadId) {
    throw new Error('S3 did not return an UploadId — multipart upload initiation failed')
  }

  return { uploadId: response.UploadId, key: uniqueKey }
}

/**
 * Generate presigned URLs for each requested upload part.
 *
 * @param key - S3 object key obtained from {@link initiateS3MultipartUpload}
 * @param uploadId - Multipart upload session ID
 * @param partNumbers - 1-based part number list
 * @param customConfig - Optional bucket/region override
 */
export async function getS3MultipartPartUrls(
  key: string,
  uploadId: string,
  partNumbers: number[],
  customConfig?: S3Config
): Promise<S3PartUploadUrl[]> {
  const targetConfig = customConfig ?? {
    bucket: S3_KB_CONFIG.bucket,
    region: S3_KB_CONFIG.region,
  }

  const client = getS3Client()

  return Promise.all(
    partNumbers.map(async (partNumber) => {
      const command = new UploadPartCommand({
        Bucket: targetConfig.bucket,
        Key: key,
        PartNumber: partNumber,
        UploadId: uploadId,
      })

      const url = await getSignedUrl(client, command, { expiresIn: 3600 })
      return { partNumber, url }
    })
  )
}

/**
 * Finalise a multipart upload and return location/serve-path information.
 *
 * @param key - S3 object key
 * @param uploadId - Multipart upload session ID
 * @param parts - Array of `{ ETag, PartNumber }` from each completed part
 * @param customConfig - Optional bucket/region override
 */
export async function completeS3MultipartUpload(
  key: string,
  uploadId: string,
  parts: S3MultipartPart[],
  customConfig?: S3Config
): Promise<{ location: string; path: string; key: string }> {
  const targetConfig = customConfig ?? {
    bucket: S3_KB_CONFIG.bucket,
    region: S3_KB_CONFIG.region,
  }

  const sortedParts = [...parts].sort((a, b) => a.PartNumber - b.PartNumber)

  const response = await getS3Client().send(
    new CompleteMultipartUploadCommand({
      Bucket: targetConfig.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: sortedParts },
    })
  )

  const location =
    response.Location ??
    `https://${targetConfig.bucket}.s3.${targetConfig.region}.amazonaws.com/${key}`

  return {
    location,
    path: `/api/files/serve/${encodeURIComponent(key)}`,
    key,
  }
}

/**
 * Abort an in-progress multipart upload and release any uploaded parts.
 *
 * @param key - S3 object key
 * @param uploadId - Multipart upload session ID to abort
 * @param customConfig - Optional bucket/region override
 */
export async function abortS3MultipartUpload(
  key: string,
  uploadId: string,
  customConfig?: S3Config
): Promise<void> {
  const targetConfig = customConfig ?? {
    bucket: S3_KB_CONFIG.bucket,
    region: S3_KB_CONFIG.region,
  }

  await getS3Client().send(
    new AbortMultipartUploadCommand({
      Bucket: targetConfig.bucket,
      Key: key,
      UploadId: uploadId,
    })
  )
}

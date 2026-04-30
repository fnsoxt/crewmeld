/**
 * Conversation file storage — based on MinIO (S3 compatible)
 *
 * File path format: conversations/{conversationId}/{timestamp}_{filename}
 * Access: /api/employee/conversations/files/{key} (proxy endpoint, login auth, never expires)
 */

import { createHmac, randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createLogger } from '@crewmeld/logger'

const logger = createLogger('ConversationFileStorage')

const MINIO_ENDPOINT = (process.env.MINIO_ENDPOINT ?? '').trim()
const MINIO_ACCESS_KEY = (process.env.MINIO_ACCESS_KEY ?? '').trim()
const MINIO_SECRET_KEY = (process.env.MINIO_SECRET_KEY ?? '').trim()
const MINIO_BUCKET = (process.env.MINIO_BUCKET ?? 'tool-files').trim()
/**
 * MinIO address accessible by tool Pods (for generating presigned URLs)
 * Falls back to MINIO_ENDPOINT if not configured — requires CrewMeld and tool Pods to use same MinIO address
 */
const MINIO_EXTERNAL_ENDPOINT = (process.env.MINIO_EXTERNAL_ENDPOINT ?? '').trim()

/** File attachment metadata (stored in conversationMessages.metadata.files) */
export interface FileAttachment {
  key: string // S3 object key
  name: string // Original filename
  size: number // Bytes
  mimeType: string // MIME type
}

let _client: S3Client | null = null

function getClient(): S3Client {
  if (_client) return _client
  _client = new S3Client({
    endpoint: MINIO_ENDPOINT,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: MINIO_ACCESS_KEY,
      secretAccessKey: MINIO_SECRET_KEY,
    },
  })
  return _client
}

/**
 * Upload file to MinIO
 *
 * @returns FileAttachment metadata (for storing in metadata.files)
 */
export async function uploadConversationFile(
  conversationId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string
): Promise<FileAttachment> {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, '_')
  const key = `conversations/${conversationId}/${Date.now()}_${safeFileName}`

  await getClient().send(
    new PutObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  )

  logger.info('Conversation file uploaded', { conversationId, key, size: buffer.length, mimeType })

  return {
    key,
    name: fileName,
    size: buffer.length,
    mimeType,
  }
}

/**
 * Read file from MinIO (for proxy endpoint use)
 *
 * @returns { body, contentType, contentLength } or null
 */
export async function getConversationFile(key: string): Promise<{
  body: ReadableStream | NodeJS.ReadableStream
  contentType: string
  contentLength: number
} | null> {
  try {
    const result = await getClient().send(
      new GetObjectCommand({
        Bucket: MINIO_BUCKET,
        Key: key,
      })
    )
    return {
      body: result.Body as ReadableStream | NodeJS.ReadableStream,
      contentType: result.ContentType ?? 'application/octet-stream',
      contentLength: result.ContentLength ?? 0,
    }
  } catch (err) {
    logger.warn('Conversation file read failed', { key, error: (err as Error).message })
    return null
  }
}

/**
 * Generate presigned URL for file (for external tools to download directly, no login required)
 *
 * @param key S3 object key
 * @param expiresIn validity period (seconds), default 1 hour
 */
export async function getConversationFilePresignedUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: MINIO_BUCKET,
    Key: key,
  })
  return getSignedUrl(getClient(), command, { expiresIn })
}

// ---------------------------------------------------------------------------
// Tool-accessible file URLs (for SOP / conversation tool Pods to download files)
// ---------------------------------------------------------------------------

/**
 * Generate tool Pod-accessible download URL for conversation attachments
 *
 * Strategy:
 * 1. Copy file to ASCII-safe temporary path sop-temp/{uuid}/{ascii-name}.{ext}
 *    Prevent Chinese filenames from being URL-encoded as %XX causing tool parsing failures
 * 2. Generate MinIO presigned URL (1 hour validity)
 * 3. If MINIO_EXTERNAL_ENDPOINT is configured, replace host address in URL
 *    Ensure tool Pods can access MinIO via external network
 */
/**
 * Get S3 client for generating tool presigned URLs
 * If MINIO_EXTERNAL_ENDPOINT is configured, use it (ensure signature and host match)
 */
let _externalClient: S3Client | null = null
function getExternalClient(): S3Client {
  if (!MINIO_EXTERNAL_ENDPOINT || MINIO_EXTERNAL_ENDPOINT === MINIO_ENDPOINT) {
    return getClient()
  }
  if (_externalClient) return _externalClient
  _externalClient = new S3Client({
    endpoint: MINIO_EXTERNAL_ENDPOINT,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: MINIO_ACCESS_KEY,
      secretAccessKey: MINIO_SECRET_KEY,
    },
  })
  return _externalClient
}

export async function createToolAccessibleUrl(
  key: string,
  originalName: string,
  expiresIn = 3600
): Promise<string> {
  // Generate ASCII-safe filename: preserve extension, replace name with UUID
  const ext = extname(originalName) || '.bin'
  const asciiName = `${randomUUID()}${ext}`
  const tempKey = `sop-temp/${asciiName}`

  // Read source file content as Buffer (stream passthrough to PutObject is unreliable on MinIO)
  const source = await getClient().send(
    new GetObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: key,
    })
  )
  const bodyBytes = await source.Body!.transformToByteArray()
  const buffer = Buffer.from(bodyBytes)

  // Write to temporary path
  await getClient().send(
    new PutObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: tempKey,
      Body: buffer,
      ContentType: source.ContentType,
    })
  )

  logger.info('Tool temp file copied', {
    originalKey: key,
    tempKey,
    size: buffer.length,
  })

  // Generate presigned URL with external client (ensure signing host matches actual access host)
  const command = new GetObjectCommand({
    Bucket: MINIO_BUCKET,
    Key: tempKey,
  })
  const url = await getSignedUrl(getExternalClient(), command, { expiresIn })

  logger.info('Tool temp file URL generated', {
    tempKey,
    expiresIn,
    urlHost: MINIO_EXTERNAL_ENDPOINT || MINIO_ENDPOINT,
  })
  return url
}

// ---------------------------------------------------------------------------
// Temp file access token (stateless HMAC signing, backup approach)
// ---------------------------------------------------------------------------

const TEMP_FILE_TTL_MS = 3600 * 1000 // 1 hour

function getTempFileSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error(
      'Missing AUTH_SECRET or NEXTAUTH_SECRET environment variable — required for HMAC signing'
    )
  }
  return secret
}

/**
 * Generate temp access token for conversation file (stateless HMAC, no database needed)
 *
 * Token format: base64url(key):expiry:hmac
 * Returns: { token, fileName }
 */
export function generateTempFileToken(
  key: string,
  fileName: string
): { token: string; fileName: string } {
  const expiry = Date.now() + TEMP_FILE_TTL_MS
  const keyB64 = Buffer.from(key).toString('base64url')
  const payload = `${keyB64}:${expiry}`
  const sig = createHmac('sha256', getTempFileSecret()).update(payload).digest('base64url')
  return { token: `${payload}:${sig}`, fileName }
}

/**
 * Verify temp file token, return MinIO key or null
 */
export function verifyTempFileToken(token: string): string | null {
  const parts = token.split(':')
  if (parts.length !== 3) return null

  const [keyB64, expiryStr, sig] = parts
  const expiry = Number.parseInt(expiryStr, 10)
  if (Number.isNaN(expiry) || Date.now() > expiry) return null

  const payload = `${keyB64}:${expiryStr}`
  const expected = createHmac('sha256', getTempFileSecret()).update(payload).digest('base64url')
  if (sig !== expected) return null

  return Buffer.from(keyB64, 'base64url').toString('utf-8')
}

/**
 * Delete all files for a single conversation
 *
 * Strategy: list by prefix conversations/{conversationId}/ and batch delete
 */
export async function deleteConversationFiles(conversationId: string): Promise<number> {
  const client = getClient()
  const prefix = `conversations/${conversationId}/`

  let deleted = 0
  let continuationToken: string | undefined

  do {
    const list = await client.send(
      new ListObjectsV2Command({
        Bucket: MINIO_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    )

    const objects = list.Contents
    if (!objects || objects.length === 0) break

    // Delete one by one (MinIO DeleteObjects requires Content-MD5, AWS SDK v3 does not include by default)
    await Promise.all(
      objects.map((o) =>
        client.send(new DeleteObjectCommand({ Bucket: MINIO_BUCKET, Key: o.Key! }))
      )
    )

    deleted += objects.length
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined
  } while (continuationToken)

  if (deleted > 0) {
    logger.info('Conversation files cleaned up', { conversationId, deletedCount: deleted })
  }

  return deleted
}

/**
 * Batch delete files by specified keys (delete by key list from message metadata)
 */
export async function deleteFilesByKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return

  const client = getClient()

  // Delete one by one (MinIO DeleteObjects requires Content-MD5, AWS SDK v3 does not include by default)
  await Promise.all(
    keys.map((key) => client.send(new DeleteObjectCommand({ Bucket: MINIO_BUCKET, Key: key })))
  )

  logger.info('Batch file deletion completed', { count: keys.length })
}

import type { Logger } from '@crewmeld/logger'
import type { UserFile } from '@/lib/types/execution'
import { isUuid } from '@/lib/types/execution-constants'
import type { StorageContext } from '@/lib/uploads'
import { ACCEPTED_FILE_TYPES, SUPPORTED_DOCUMENT_EXTENSIONS } from '@/lib/uploads/utils/validation'

// ─── attachment types ────────────────────────────────────────────────────────

/** A file attachment descriptor used in LLM message construction. */
export interface FileAttachment {
  id: string
  key: string
  filename: string
  media_type: string
  size: number
}

/** A single content block in an Anthropic-style message. */
export interface MessageContent {
  type: 'text' | 'image' | 'document' | 'audio' | 'video'
  text?: string
  source?: {
    type: 'base64'
    media_type: string
    data: string
  }
}

// ─── MIME-type mapping ───────────────────────────────────────────────────────

/** Maps MIME types to Anthropic content-block types. */
export const MIME_TYPE_MAPPING: Record<string, 'image' | 'document' | 'audio' | 'video'> = {
  // Images
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/svg+xml': 'image',
  // Documents
  'application/pdf': 'document',
  'text/plain': 'document',
  'text/csv': 'document',
  'application/json': 'document',
  'application/xml': 'document',
  'text/xml': 'document',
  'text/html': 'document',
  'text/markdown': 'document',
  'application/rtf': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'document',
  'application/msword': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.ms-powerpoint': 'document',
  // Audio
  'audio/mpeg': 'audio',
  'audio/mp3': 'audio',
  'audio/mp4': 'audio',
  'audio/x-m4a': 'audio',
  'audio/m4a': 'audio',
  'audio/wav': 'audio',
  'audio/wave': 'audio',
  'audio/x-wav': 'audio',
  'audio/webm': 'audio',
  'audio/ogg': 'audio',
  'audio/vorbis': 'audio',
  'audio/flac': 'audio',
  'audio/x-flac': 'audio',
  'audio/aac': 'audio',
  'audio/x-aac': 'audio',
  'audio/opus': 'audio',
  // Video
  'video/mp4': 'video',
  'video/mpeg': 'video',
  'video/quicktime': 'video',
  'video/x-quicktime': 'video',
  'video/x-msvideo': 'video',
  'video/avi': 'video',
  'video/x-matroska': 'video',
  'video/webm': 'video',
}

// ─── MIME helpers ────────────────────────────────────────────────────────────

/** Return the Anthropic content-block type for a MIME type, or `null`. */
export function getContentType(mimeType: string): 'image' | 'document' | 'audio' | 'video' | null {
  return MIME_TYPE_MAPPING[mimeType.toLowerCase()] ?? null
}

/** Return `true` when the MIME type is present in the mapping table. */
export function isSupportedFileType(mimeType: string): boolean {
  return mimeType.toLowerCase() in MIME_TYPE_MAPPING
}

/** Return `true` when the MIME type represents an image. */
export function isImageFileType(mimeType: string): boolean {
  return getContentType(mimeType) === 'image'
}

/** Return `true` when the MIME type represents an audio file. */
export function isAudioFileType(mimeType: string): boolean {
  return getContentType(mimeType) === 'audio'
}

/** Return `true` when the MIME type represents a video file. */
export function isVideoFileType(mimeType: string): boolean {
  return getContentType(mimeType) === 'video'
}

/** Return `true` when the MIME type represents audio or video. */
export function isMediaFileType(mimeType: string): boolean {
  const ct = getContentType(mimeType)
  return ct === 'audio' || ct === 'video'
}

// ─── extension / MIME conversion ─────────────────────────────────────────────

/** Extract the lowercased extension (without dot) from a filename. */
export function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf('.')
  return idx !== -1 ? filename.slice(idx + 1).toLowerCase() : ''
}

/** Extension → MIME type map (fallback lookup). */
const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  xml: 'application/xml',
  html: 'text/html',
  htm: 'text/html',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint',
  md: 'text/markdown',
  rtf: 'application/rtf',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  opus: 'audio/opus',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
}

/** Return the MIME type for a file extension, or `'application/octet-stream'`. */
export function getMimeTypeFromExtension(extension: string): string {
  return EXTENSION_TO_MIME[extension.toLowerCase()] ?? 'application/octet-stream'
}

/** MIME type → extension map (reverse of `EXTENSION_TO_MIME`). */
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/json': 'json',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'text/html': 'html',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.ms-powerpoint': 'ppt',
  'text/markdown': 'md',
  'application/rtf': 'rtf',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/vorbis': 'ogg',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/aac': 'aac',
  'audio/x-aac': 'aac',
  'audio/opus': 'opus',
  'video/mp4': 'mp4',
  'video/mpeg': 'mpg',
  'video/quicktime': 'mov',
  'video/x-quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/avi': 'avi',
  'video/x-matroska': 'mkv',
  'video/webm': 'webm',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/gzip': 'gz',
}

/** Return the file extension for a MIME type, or `null` when unknown. */
export function getExtensionFromMimeType(mimeType: string): string | null {
  return MIME_TO_EXTENSION[mimeType.toLowerCase()] ?? null
}

// ─── buffer / content helpers ────────────────────────────────────────────────

/** Encode a `Buffer` as a base64 string. */
export function bufferToBase64(buffer: Buffer): string {
  return buffer.toString('base64')
}

/**
 * Build an Anthropic-style content block from file bytes and a MIME type.
 * Returns `null` when the MIME type is not supported.
 */
export function createFileContent(fileBuffer: Buffer, mimeType: string): MessageContent | null {
  const contentType = getContentType(mimeType)
  if (!contentType) return null

  return {
    type: contentType,
    source: { type: 'base64', media_type: mimeType, data: bufferToBase64(fileBuffer) },
  }
}

// ─── file-size formatting ─────────────────────────────────────────────────────

/**
 * Format a byte count as a human-readable file size string (e.g. `"1.5 MB"`).
 */
export function formatFileSize(
  bytes: number,
  options?: { includeBytes?: boolean; precision?: number }
): string {
  if (bytes === 0) return '0 Bytes'

  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const precision = options?.precision ?? 1
  const i = Math.floor(Math.log(bytes) / Math.log(1024))

  if (i === 0 && !options?.includeBytes) return '0 Bytes'

  const value = bytes / 1024 ** i
  return `${Number.parseFloat(value.toFixed(precision))} ${units[i]}`
}

// ─── knowledge-base validation ────────────────────────────────────────────────

/**
 * Validate a file for knowledge-base upload (client-side).
 * Returns an error message string on failure, or `null` when the file is valid.
 */
export function validateKnowledgeBaseFile(
  file: File,
  maxSizeBytes = 100 * 1024 * 1024
): string | null {
  if (file.size > maxSizeBytes) {
    const maxMB = Math.round(maxSizeBytes / (1024 * 1024))
    return `File "${file.name}" is too large. Maximum size is ${maxMB}MB.`
  }

  if (ACCEPTED_FILE_TYPES.includes(file.type)) return null

  const ext = getFileExtension(file.name)
  if (
    SUPPORTED_DOCUMENT_EXTENSIONS.includes(ext as (typeof SUPPORTED_DOCUMENT_EXTENSIONS)[number])
  ) {
    return null
  }

  return `File "${file.name}" has an unsupported format. Please use PDF, DOC, DOCX, TXT, CSV, XLS, XLSX, MD, PPT, PPTX, HTML, JSON, YAML, or YML files.`
}

// ─── metadata sanitisation ────────────────────────────────────────────────────

/**
 * Sanitise a filename so it is safe for use in S3/HTTP metadata headers.
 * Strips non-ASCII and problematic characters; falls back to `'file'`.
 */
export function sanitizeFilenameForMetadata(filename: string): string {
  return (
    filename
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/["\\]/g, '')
      .replace(/\s+/g, ' ')
      .trim() || 'file'
  )
}

/**
 * Sanitise all values in a metadata object for storage providers.
 * Truncates values to `maxLength` and removes non-printable characters.
 */
export function sanitizeStorageMetadata(
  metadata: Record<string, string>,
  maxLength: number
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const [key, value] of Object.entries(metadata)) {
    const clean = String(value)
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/["\\]/g, '')
      .substring(0, maxLength)

    if (clean) result[key] = clean
  }

  return result
}

/**
 * Sanitise and validate a storage file key.
 * Requires a context prefix (e.g. `kb/`, `workspace/`).
 * Prevents path-traversal attacks.
 *
 * @throws When the key has no prefix or contains `..` / `.` segments.
 */
export function sanitizeFileKey(key: string): string {
  if (!key.includes('/')) {
    throw new Error('File key must include a context prefix (e.g., kb/, workspace/, execution/)')
  }

  const segments = key.split('/')

  const sanitised = segments.map((segment, index) => {
    if (segment === '..' || segment === '.') {
      throw new Error('Path traversal detected in file key')
    }
    // Filename segment (last): allow dots for extensions
    if (index === segments.length - 1) {
      return segment.replace(/[^a-zA-Z0-9.-]/g, '_')
    }
    return segment.replace(/[^a-zA-Z0-9-]/g, '_')
  })

  return sanitised.join('/')
}

// ─── URL helpers ─────────────────────────────────────────────────────────────

/** Return `true` when `fileUrl` references the internal file-serve endpoint. */
export function isInternalFileUrl(fileUrl: string): boolean {
  return fileUrl.includes('/api/files/serve/')
}

/**
 * Extract the raw storage key from an internal serve URL or path.
 * Strips `s3/` and `blob/` sub-prefixes if present.
 */
export function extractStorageKey(filePath: string): string {
  let cleanPath = filePath.split('?')[0]

  try {
    if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
      cleanPath = new URL(cleanPath).pathname
    }
  } catch {
    // Ignore URL parse errors; use original path
  }

  if (!cleanPath.startsWith('/api/files/serve/')) return cleanPath

  let key = decodeURIComponent(cleanPath.substring('/api/files/serve/'.length))

  if (key.startsWith('s3/')) key = key.substring(3)
  else if (key.startsWith('blob/')) key = key.substring(5)

  return key
}

/**
 * Infer the storage context from a key's prefix.
 *
 * @throws When the key is empty or has no recognised prefix.
 */
export function inferContextFromKey(key: string): StorageContext {
  if (!key) throw new Error('Cannot infer context from empty key')

  if (key.startsWith('kb/')) return 'knowledge-base'
  if (key.startsWith('chat/')) return 'chat'
  if (key.startsWith('copilot/')) return 'copilot'
  if (key.startsWith('execution/')) return 'execution'
  if (key.startsWith('workspace/')) return 'workspace'
  if (key.startsWith('profile-pictures/')) return 'profile-pictures'
  if (key.startsWith('logs/')) return 'logs'

  throw new Error(
    `File key must start with a context prefix (kb/, chat/, copilot/, execution/, workspace/, profile-pictures/, or logs/). Got: ${key}`
  )
}

/**
 * Parse an internal file URL into a storage key and context.
 * Context is read from the `context` query parameter when present; otherwise
 * it is inferred from the key prefix.
 */
export function parseInternalFileUrl(fileUrl: string): { key: string; context: StorageContext } {
  const key = extractStorageKey(fileUrl)

  if (!key) throw new Error('Could not extract storage key from internal file URL')

  const url = new URL(fileUrl.startsWith('http') ? fileUrl : `http://localhost${fileUrl}`)
  const contextParam = url.searchParams.get('context') as StorageContext | null
  const context = contextParam ?? inferContextFromKey(key)

  return { key, context }
}

/**
 * Strip query parameters and return a clean filename from a URL or path.
 */
export function extractCleanFilename(urlOrPath: string): string {
  const withoutQuery = urlOrPath.split('?')[0]

  try {
    const url = new URL(
      withoutQuery.startsWith('http') ? withoutQuery : `http://localhost${withoutQuery}`
    )
    return decodeURIComponent(url.pathname.split('/').pop() ?? 'unknown')
  } catch {
    return decodeURIComponent(withoutQuery.split('/').pop() ?? 'unknown')
  }
}

// ─── execution-key helpers ────────────────────────────────────────────────────

/**
 * Extract the workspace ID from an execution file key.
 * Format: `execution/{workspaceId}/{workflowId}/{executionId}/{filename}`
 *
 * Returns `null` when the key does not match the pattern or the ID is not a UUID.
 */
export function extractWorkspaceIdFromExecutionKey(key: string): string | null {
  const segments = key.split('/')

  if (segments[0] === 'execution' && segments.length >= 5) {
    const workspaceId = segments[1]
    if (workspaceId && isUuid(workspaceId)) return workspaceId
  }

  return null
}

/**
 * Build the viewer URL for a file.
 * Format: `/workspace/{workspaceId}/files/{fileKey}/view`
 *
 * Returns `null` when the workspace ID cannot be determined.
 */
export function getViewerUrl(fileKey: string, workspaceId?: string): string | null {
  const resolved = workspaceId ?? extractWorkspaceIdFromExecutionKey(fileKey)
  if (!resolved) return null
  return `/workspace/${resolved}/files/${fileKey}/view`
}

// ─── HTTPS URL extraction ─────────────────────────────────────────────────────

/**
 * Extract an HTTPS URL from an arbitrary file input object.
 * Returns `null` when no valid HTTPS URL is present.
 */
export function resolveHttpsUrlFromFileInput(fileInput: unknown): string | null {
  if (!fileInput || typeof fileInput !== 'object') return null

  const record = fileInput as Record<string, unknown>
  const raw =
    typeof record.url === 'string'
      ? record.url.trim()
      : typeof record.path === 'string'
        ? record.path.trim()
        : ''

  return raw.startsWith('https://') ? raw : null
}

// ─── RawFileInput type and conversion ─────────────────────────────────────────

/** Raw file input shape accepted from various sources. */
export interface RawFileInput {
  id?: string
  key?: string
  path?: string
  url?: string
  name: string
  size: number
  type?: string
  uploadedAt?: string | Date
  expiresAt?: string | Date
  context?: string
  base64?: string
}

/** Return `true` when `file` satisfies all `UserFile` required fields. */
function isCompleteUserFile(file: RawFileInput): file is UserFile {
  return (
    typeof file.id === 'string' &&
    typeof file.name === 'string' &&
    typeof file.url === 'string' &&
    typeof file.size === 'number' &&
    typeof file.type === 'string' &&
    typeof file.key === 'string'
  )
}

function looksLikeUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')
}

function pickInternalUrl(file: RawFileInput): string {
  if (file.url && isInternalFileUrl(file.url)) return file.url
  if (file.path && isInternalFileUrl(file.path)) return file.path
  return ''
}

function resolveKeyFromRaw(file: RawFileInput): string | null {
  if (file.key) return file.key

  if (file.path) {
    if (!looksLikeUrl(file.path)) return file.path
    return isInternalFileUrl(file.path) ? extractStorageKey(file.path) : null
  }

  if (file.url) {
    return isInternalFileUrl(file.url) ? extractStorageKey(file.url) : null
  }

  return null
}

function convertRawToUserFile(
  file: RawFileInput,
  requestId: string,
  logger: Logger
): UserFile | null {
  if (isCompleteUserFile(file)) {
    return { ...file, url: pickInternalUrl(file) || file.url }
  }

  const storageKey = resolveKeyFromRaw(file)
  if (!storageKey) return null

  const userFile: UserFile = {
    id: file.id ?? `file-${Date.now()}`,
    name: file.name,
    url: pickInternalUrl(file),
    size: file.size,
    type: file.type ?? 'application/octet-stream',
    key: storageKey,
    context: file.context,
    base64: file.base64,
  }

  logger.info(`[${requestId}] Converted file to UserFile: ${userFile.name} (key: ${userFile.key})`)
  return userFile
}

/**
 * Convert a single `RawFileInput` to `UserFile`.
 *
 * @throws When the input is an array or has no resolvable storage key.
 */
export function processSingleFileToUserFile(
  file: RawFileInput,
  requestId: string,
  logger: Logger
): UserFile {
  if (Array.isArray(file)) {
    const msg = `Expected a single file but received an array with ${(file as unknown[]).length} file(s). Use a file input that accepts multiple files, or select a specific file from the array (e.g., {{block.files[0]}}).`
    logger.error(`[${requestId}] ${msg}`)
    throw new Error(msg)
  }

  const userFile = convertRawToUserFile(file, requestId, logger)
  if (!userFile) {
    const msg = `File has no storage key: ${file.name ?? 'unknown'}`
    logger.warn(`[${requestId}] ${msg}`)
    throw new Error(msg)
  }

  return userFile
}

/**
 * Convert one or more `RawFileInput` values to an array of `UserFile` objects.
 * Entries that cannot be converted are skipped with a warning.
 */
export function processFilesToUserFiles(
  files: RawFileInput | RawFileInput[],
  requestId: string,
  logger: Logger
): UserFile[] {
  const list = Array.isArray(files) ? files : [files]
  const result: UserFile[] = []

  for (const file of list) {
    if (Array.isArray(file)) {
      logger.warn(`[${requestId}] Skipping nested array in file input`)
      continue
    }

    const userFile = convertRawToUserFile(file, requestId, logger)
    if (userFile) {
      result.push(userFile)
    } else {
      logger.warn(`[${requestId}] Skipping file without storage key: ${file.name ?? 'unknown'}`)
    }
  }

  return result
}

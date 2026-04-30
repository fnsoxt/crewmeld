import path from 'path'

// ─── size limits ─────────────────────────────────────────────────────────────

/** Maximum accepted file size (100 MB). */
export const MAX_FILE_SIZE = 100 * 1024 * 1024

// ─── supported extensions ────────────────────────────────────────────────────

export const SUPPORTED_DOCUMENT_EXTENSIONS = [
  'pdf',
  'csv',
  'doc',
  'docx',
  'txt',
  'md',
  'xlsx',
  'xls',
  'ppt',
  'pptx',
  'html',
  'htm',
  'json',
  'yaml',
  'yml',
] as const

export const SUPPORTED_AUDIO_EXTENSIONS = [
  'mp3',
  'm4a',
  'wav',
  'webm',
  'ogg',
  'flac',
  'aac',
  'opus',
] as const

export const SUPPORTED_VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm'] as const

export type SupportedDocumentExtension = (typeof SUPPORTED_DOCUMENT_EXTENSIONS)[number]
export type SupportedAudioExtension = (typeof SUPPORTED_AUDIO_EXTENSIONS)[number]
export type SupportedVideoExtension = (typeof SUPPORTED_VIDEO_EXTENSIONS)[number]
export type SupportedMediaExtension =
  | SupportedDocumentExtension
  | SupportedAudioExtension
  | SupportedVideoExtension

// ─── MIME-type maps ──────────────────────────────────────────────────────────

export const SUPPORTED_MIME_TYPES: Record<SupportedDocumentExtension, string[]> = {
  pdf: ['application/pdf', 'application/x-pdf'],
  csv: ['text/csv', 'application/csv', 'text/comma-separated-values'],
  doc: ['application/msword', 'application/doc', 'application/vnd.ms-word'],
  docx: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream',
  ],
  txt: ['text/plain', 'text/x-plain', 'application/txt'],
  md: [
    'text/markdown',
    'text/x-markdown',
    'text/plain',
    'application/markdown',
    'application/octet-stream',
  ],
  xlsx: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
  ],
  xls: [
    'application/vnd.ms-excel',
    'application/excel',
    'application/x-excel',
    'application/x-msexcel',
  ],
  ppt: ['application/vnd.ms-powerpoint', 'application/powerpoint', 'application/x-mspowerpoint'],
  pptx: [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/octet-stream',
  ],
  html: ['text/html', 'application/xhtml+xml'],
  htm: ['text/html', 'application/xhtml+xml'],
  json: ['application/json', 'text/json', 'application/x-json'],
  yaml: ['text/yaml', 'text/x-yaml', 'application/yaml', 'application/x-yaml'],
  yml: ['text/yaml', 'text/x-yaml', 'application/yaml', 'application/x-yaml'],
}

export const SUPPORTED_AUDIO_MIME_TYPES: Record<SupportedAudioExtension, string[]> = {
  mp3: ['audio/mpeg', 'audio/mp3'],
  m4a: ['audio/mp4', 'audio/x-m4a', 'audio/m4a'],
  wav: ['audio/wav', 'audio/wave', 'audio/x-wav'],
  webm: ['audio/webm'],
  ogg: ['audio/ogg', 'audio/vorbis'],
  flac: ['audio/flac', 'audio/x-flac'],
  aac: ['audio/aac', 'audio/x-aac'],
  opus: ['audio/opus'],
}

export const SUPPORTED_VIDEO_MIME_TYPES: Record<SupportedVideoExtension, string[]> = {
  mp4: ['video/mp4', 'video/mpeg'],
  mov: ['video/quicktime', 'video/x-quicktime'],
  avi: ['video/x-msvideo', 'video/avi'],
  mkv: ['video/x-matroska'],
  webm: ['video/webm'],
}

// ─── flat accepted-type lists ────────────────────────────────────────────────

export const ACCEPTED_FILE_TYPES = Object.values(SUPPORTED_MIME_TYPES).flat()
export const ACCEPTED_AUDIO_TYPES = Object.values(SUPPORTED_AUDIO_MIME_TYPES).flat()
export const ACCEPTED_VIDEO_TYPES = Object.values(SUPPORTED_VIDEO_MIME_TYPES).flat()
export const ACCEPTED_MEDIA_TYPES = [
  ...ACCEPTED_FILE_TYPES,
  ...ACCEPTED_AUDIO_TYPES,
  ...ACCEPTED_VIDEO_TYPES,
]

export const ACCEPTED_FILE_EXTENSIONS = SUPPORTED_DOCUMENT_EXTENSIONS.map((ext) => `.${ext}`)
export const ACCEPT_ATTRIBUTE = [...ACCEPTED_FILE_TYPES, ...ACCEPTED_FILE_EXTENSIONS].join(',')

// ─── validation error type ───────────────────────────────────────────────────

export interface FileValidationError {
  code: 'UNSUPPORTED_FILE_TYPE' | 'MIME_TYPE_MISMATCH'
  message: string
  supportedTypes: string[]
}

// ─── PNG magic-byte check ────────────────────────────────────────────────────

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * Return `true` when `buffer` begins with the PNG magic-byte sequence.
 */
export function isValidPng(buffer: Buffer): boolean {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_MAGIC)
}

// ─── extension / MIME helpers ────────────────────────────────────────────────

/** Return `true` when `extension` is a supported document extension. */
export function isSupportedExtension(extension: string): extension is SupportedDocumentExtension {
  return SUPPORTED_DOCUMENT_EXTENSIONS.includes(
    extension.toLowerCase() as SupportedDocumentExtension
  )
}

/** Return `true` when `extension` is a supported audio extension. */
export function isSupportedAudioExtension(extension: string): extension is SupportedAudioExtension {
  return SUPPORTED_AUDIO_EXTENSIONS.includes(extension.toLowerCase() as SupportedAudioExtension)
}

/** Return `true` when `extension` is a supported video extension. */
export function isSupportedVideoExtension(extension: string): extension is SupportedVideoExtension {
  return SUPPORTED_VIDEO_EXTENSIONS.includes(extension.toLowerCase() as SupportedVideoExtension)
}

/**
 * Return all accepted MIME types for a given file extension.
 * Returns an empty array for unrecognised extensions.
 */
export function getSupportedMimeTypes(extension: string): string[] {
  const lc = extension.toLowerCase()

  if (isSupportedExtension(lc)) {
    return SUPPORTED_MIME_TYPES[lc as SupportedDocumentExtension]
  }
  if (isSupportedAudioExtension(lc)) {
    return SUPPORTED_AUDIO_MIME_TYPES[lc as SupportedAudioExtension]
  }
  if (isSupportedVideoExtension(lc)) {
    return SUPPORTED_VIDEO_MIME_TYPES[lc as SupportedVideoExtension]
  }

  return []
}

// ─── file-type validators ────────────────────────────────────────────────────

/**
 * Validate that a document file has a supported extension and a matching MIME type.
 * Returns a `FileValidationError` on failure, or `null` when the file is acceptable.
 */
export function validateFileType(fileName: string, mimeType: string): FileValidationError | null {
  const ext = path.extname(fileName).toLowerCase().substring(1) as SupportedDocumentExtension

  if (!SUPPORTED_DOCUMENT_EXTENSIONS.includes(ext)) {
    return {
      code: 'UNSUPPORTED_FILE_TYPE',
      message: `Unsupported file type: ${ext}. Supported types are: ${SUPPORTED_DOCUMENT_EXTENSIONS.join(', ')}`,
      supportedTypes: [...SUPPORTED_DOCUMENT_EXTENSIONS],
    }
  }

  const baseMime = mimeType.split(';')[0].trim()
  if (!baseMime) return null // Allow empty MIME when extension is supported

  const allowed = SUPPORTED_MIME_TYPES[ext]
  if (!allowed.includes(baseMime)) {
    return {
      code: 'MIME_TYPE_MISMATCH',
      message: `MIME type ${baseMime} does not match file extension ${ext}. Expected: ${allowed.join(', ')}`,
      supportedTypes: allowed,
    }
  }

  return null
}

/**
 * Validate that a media (audio/video) file has a supported extension and matching MIME type.
 * Returns a `FileValidationError` on failure, or `null` when the file is acceptable.
 */
export function validateMediaFileType(
  fileName: string,
  mimeType: string
): FileValidationError | null {
  const ext = path.extname(fileName).toLowerCase().substring(1)

  const isAudio = isSupportedAudioExtension(ext)
  const isVideo = isSupportedVideoExtension(ext)

  if (!isAudio && !isVideo) {
    return {
      code: 'UNSUPPORTED_FILE_TYPE',
      message: `Unsupported media file type: ${ext}. Supported audio types: ${SUPPORTED_AUDIO_EXTENSIONS.join(', ')}. Supported video types: ${SUPPORTED_VIDEO_EXTENSIONS.join(', ')}`,
      supportedTypes: [...SUPPORTED_AUDIO_EXTENSIONS, ...SUPPORTED_VIDEO_EXTENSIONS],
    }
  }

  const baseMime = mimeType.split(';')[0].trim()
  const allowed = isAudio
    ? SUPPORTED_AUDIO_MIME_TYPES[ext as SupportedAudioExtension]
    : SUPPORTED_VIDEO_MIME_TYPES[ext as SupportedVideoExtension]

  if (!allowed.includes(baseMime)) {
    return {
      code: 'MIME_TYPE_MISMATCH',
      message: `MIME type ${baseMime} does not match file extension ${ext}. Expected: ${allowed.join(', ')}`,
      supportedTypes: allowed,
    }
  }

  return null
}

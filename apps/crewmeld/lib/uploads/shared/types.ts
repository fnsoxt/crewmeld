// ─── storage contexts ────────────────────────────────────────────────────────

/** All recognised storage contexts within the platform. */
export type StorageContext =
  | 'knowledge-base'
  | 'chat'
  | 'copilot'
  | 'execution'
  | 'workspace'
  | 'profile-pictures'
  | 'og-images'
  | 'logs'

// ─── file descriptor ─────────────────────────────────────────────────────────

/** Lightweight descriptor returned after a successful upload operation. */
export interface FileInfo {
  /** Serve-path or presigned URL for the uploaded object. */
  path: string
  /** Storage key (S3 object key or local filesystem sub-path). */
  key: string
  /** Original file name supplied by the caller. */
  name: string
  /** File size in bytes. */
  size: number
  /** MIME type. */
  type: string
}

// ─── storage configuration ───────────────────────────────────────────────────

/**
 * Provider-agnostic storage configuration.
 * Fields beyond `bucket` / `region` exist for future Azure Blob compatibility.
 */
export interface StorageConfig {
  bucket?: string
  region?: string
  containerName?: string
  accountName?: string
  accountKey?: string
  connectionString?: string
}

// ─── operation option types ──────────────────────────────────────────────────

/** Options accepted by {@link StorageService.uploadFile}. */
export interface UploadFileOptions {
  file: Buffer
  fileName: string
  contentType: string
  context: StorageContext
  /** When `true`, the key is stored as-is without a timestamp prefix. */
  preserveKey?: boolean
  /** Override the derived storage key entirely. */
  customKey?: string
  /** Arbitrary key/value metadata stored alongside the object. */
  metadata?: Record<string, string>
}

/** Options accepted by {@link StorageService.downloadFile}. */
export interface DownloadFileOptions {
  key: string
  context?: StorageContext
}

/** Options accepted by {@link StorageService.deleteFile}. */
export interface DeleteFileOptions {
  key: string
  context?: StorageContext
}

/** Options accepted by {@link StorageService.generatePresignedUploadUrl}. */
export interface GeneratePresignedUrlOptions {
  fileName: string
  contentType: string
  fileSize: number
  context: StorageContext
  userId?: string
  /** Seconds until the presigned URL expires (default 3600). */
  expirationSeconds?: number
  metadata?: Record<string, string>
}

/** Value returned by presigned-URL generation helpers. */
export interface PresignedUrlResponse {
  /** Presigned upload or download URL. */
  url: string
  /** Storage key associated with the URL. */
  key: string
  /** Optional headers that must accompany the upload request. */
  uploadHeaders?: Record<string, string>
}

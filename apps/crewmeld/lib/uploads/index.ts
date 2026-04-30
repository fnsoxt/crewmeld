// ─── config & context types ───────────────────────────────────────────────────
export {
  getStorageConfig,
  isUsingCloudStorage,
  type StorageConfig,
  type StorageContext,
  UPLOAD_DIR,
  USE_S3_STORAGE,
} from '@/lib/uploads/config'
// ─── context namespaces ───────────────────────────────────────────────────────
export * as ChatFiles from '@/lib/uploads/contexts/chat'
export * as ExecutionFiles from '@/lib/uploads/contexts/execution'
export * as WorkspaceFiles from '@/lib/uploads/contexts/workspace'
// ─── storage client helpers ───────────────────────────────────────────────────
export {
  getFileMetadata,
  getServePathPrefix,
  getStorageProvider,
} from '@/lib/uploads/core/storage-client'
// ─── storage service ──────────────────────────────────────────────────────────
export * as StorageService from '@/lib/uploads/core/storage-service'
// ─── file utilities ───────────────────────────────────────────────────────────
export {
  bufferToBase64,
  createFileContent as createAnthropicFileContent,
  type FileAttachment,
  getContentType as getAnthropicContentType,
  getFileExtension,
  getMimeTypeFromExtension,
  isSupportedFileType,
  type MessageContent as AnthropicMessageContent,
  MIME_TYPE_MAPPING,
} from '@/lib/uploads/utils/file-utils'

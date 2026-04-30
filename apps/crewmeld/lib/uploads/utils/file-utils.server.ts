'use server'

import type { Logger } from '@crewmeld/logger'
import { getMaxExecutionTimeout } from '@/lib/core/execution-limits'
import {
  secureFetchWithPinnedIP,
  validateUrlWithDNS,
} from '@/lib/core/security/input-validation.server'
import type { UserFile } from '@/lib/types/execution'
import type { StorageContext } from '@/lib/uploads'
import { StorageService } from '@/lib/uploads'
import { isExecutionFile } from '@/lib/uploads/contexts/execution/utils'
import {
  extractStorageKey,
  inferContextFromKey,
  isInternalFileUrl,
  processSingleFileToUserFile,
  type RawFileInput,
} from '@/lib/uploads/utils/file-utils'
import { verifyFileAccess } from '@/app/api/files/authorization'

// ─── types ───────────────────────────────────────────────────────────────────

/** Result returned by file-input resolution helpers. */
export interface FileResolutionResult {
  fileUrl?: string
  error?: { status: number; message: string }
}

/** Options for {@link resolveFileInputToUrl}. */
export interface ResolveFileInputOptions {
  file?: RawFileInput
  filePath?: string
  userId: string
  requestId: string
  logger: Logger
}

// ─── internal helpers ────────────────────────────────────────────────────────

/**
 * Check access and generate a short-lived presigned URL for a storage key.
 * Returns an error result when the caller is not authorised.
 */
async function presignWithAccessCheck(
  key: string,
  context: StorageContext,
  userId: string,
  requestId: string,
  logger: Logger
): Promise<FileResolutionResult> {
  const hasAccess = await verifyFileAccess(key, userId, undefined, context, false)

  if (!hasAccess) {
    logger.warn(`[${requestId}] Unauthorised presigned URL attempt`, { userId, key, context })
    return { error: { status: 404, message: 'File not found' } }
  }

  const fileUrl = await StorageService.generatePresignedDownloadUrl(key, context, 5 * 60)
  return { fileUrl }
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Resolve an internal serve URL to a short-lived presigned download URL.
 * Pass-through for external URLs (returned as-is).
 */
export async function resolveInternalFileUrl(
  filePath: string,
  userId: string,
  requestId: string,
  logger: Logger
): Promise<FileResolutionResult> {
  if (!isInternalFileUrl(filePath)) {
    return { fileUrl: filePath }
  }

  try {
    const storageKey = extractStorageKey(filePath)
    const context = inferContextFromKey(storageKey)
    const result = await presignWithAccessCheck(storageKey, context, userId, requestId, logger)

    if (!result.error) {
      logger.info(`[${requestId}] Generated presigned URL for ${context} file`)
    }

    return result
  } catch (error) {
    logger.error(`[${requestId}] Failed to generate presigned URL:`, error)
    return { error: { status: 500, message: 'Failed to generate file access URL' } }
  }
}

/**
 * Resolve a file input (object or path string) to a publicly accessible URL.
 *
 * Handles:
 * - Processing raw file input via {@link processSingleFileToUserFile}
 * - Resolving internal URLs to presigned download URLs
 * - Generating presigned URLs from bare storage keys
 * - Validating external URLs via DNS/SSRF checks
 */
export async function resolveFileInputToUrl(
  options: ResolveFileInputOptions
): Promise<FileResolutionResult> {
  const { file, filePath, userId, requestId, logger } = options

  if (file) {
    let userFile: UserFile

    try {
      userFile = processSingleFileToUserFile(file, requestId, logger)
    } catch (error) {
      return {
        error: {
          status: 400,
          message: error instanceof Error ? error.message : 'Failed to process file',
        },
      }
    }

    let fileUrl = userFile.url ?? ''

    if (fileUrl && isInternalFileUrl(fileUrl)) {
      const resolution = await resolveInternalFileUrl(fileUrl, userId, requestId, logger)
      if (resolution.error) return { error: resolution.error }
      fileUrl = resolution.fileUrl ?? ''
    }

    // Generate presigned URL when we have a key but no resolved URL
    if (!fileUrl && userFile.key) {
      const context =
        (userFile.context as StorageContext | undefined) ?? inferContextFromKey(userFile.key)
      const result = await presignWithAccessCheck(userFile.key, context, userId, requestId, logger)
      if (result.error) return { error: result.error }
      fileUrl = result.fileUrl ?? ''
    }

    return { fileUrl }
  }

  if (filePath) {
    if (isInternalFileUrl(filePath)) {
      return resolveInternalFileUrl(filePath, userId, requestId, logger)
    }

    if (filePath.startsWith('/')) {
      logger.warn(`[${requestId}] Invalid internal path`, {
        userId,
        path: filePath.substring(0, 50),
      })
      return {
        error: {
          status: 400,
          message: 'Invalid file path. Only uploaded files are supported for internal paths.',
        },
      }
    }

    const validation = await validateUrlWithDNS(filePath, 'filePath')
    if (!validation.isValid) {
      return { error: { status: 400, message: validation.error ?? 'Invalid URL' } }
    }

    return { fileUrl: filePath }
  }

  return { error: { status: 400, message: 'File input is required' } }
}

/**
 * Download a file from a URL (internal or external).
 *
 * - Internal URLs: direct storage access (bypasses HTTP, server-side only).
 * - External URLs: DNS/SSRF-validated secure fetch with IP pinning.
 */
export async function downloadFileFromUrl(
  fileUrl: string,
  timeoutMs = getMaxExecutionTimeout()
): Promise<Buffer> {
  if (isInternalFileUrl(fileUrl)) {
    const { parseInternalFileUrl } = await import('./file-utils')
    const { key, context } = parseInternalFileUrl(fileUrl)
    const { downloadFile } = await import('@/lib/uploads/core/storage-service')
    return downloadFile({ key, context })
  }

  const validation = await validateUrlWithDNS(fileUrl, 'fileUrl')
  if (!validation.isValid) {
    throw new Error(`Invalid file URL: ${validation.error}`)
  }

  const response = await secureFetchWithPinnedIP(fileUrl, validation.resolvedIP!, {
    timeout: timeoutMs,
  })

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`)
  }

  return Buffer.from(await response.arrayBuffer())
}

/**
 * Download a file from storage, routing execution files through the dedicated
 * execution file manager and all others through the generic storage service.
 */
export async function downloadFileFromStorage(
  userFile: UserFile,
  requestId: string,
  logger: Logger
): Promise<Buffer> {
  if (isExecutionFile(userFile)) {
    logger.info(`[${requestId}] Downloading from execution storage: ${userFile.key}`)
    const { downloadExecutionFile } = await import(
      '@/lib/uploads/contexts/execution/execution-file-manager'
    )
    return downloadExecutionFile(userFile)
  }

  if (userFile.key) {
    const context =
      (userFile.context as StorageContext | undefined) ?? inferContextFromKey(userFile.key)
    const label = userFile.context ? 'explicit' : 'inferred'
    logger.info(`[${requestId}] Downloading from ${context} storage (${label}): ${userFile.key}`)
    const { downloadFile } = await import('@/lib/uploads/core/storage-service')
    return downloadFile({ key: userFile.key, context })
  }

  throw new Error('File has no key — cannot download')
}

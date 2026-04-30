/**
 * Workspace file storage system.
 * Files uploaded at workspace level persist indefinitely and are accessible
 * across all workflows within that workspace.
 */

import { db } from '@crewmeld/db'
import { workspaceFiles } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, eq } from 'drizzle-orm'
import type { UserFile } from '@/lib/types/execution'
import { isUuid, sanitizeFileName } from '@/lib/types/execution-constants'
import {
  deleteFile,
  downloadFile,
  hasCloudStorage,
  uploadFile,
} from '@/lib/uploads/core/storage-service'
import { getFileMetadataByKey, insertFileMetadata } from '@/lib/uploads/server/metadata'

const logger = createLogger('WorkspaceFileStorage')

// ─── types ───────────────────────────────────────────────────────────────────

/** A workspace file record as returned to callers. */
export interface WorkspaceFileRecord {
  id: string
  workspaceId: string
  name: string
  key: string
  /** Full serve path including storage type. */
  path: string
  /** Presigned URL for external access (optional — regenerated as needed). */
  url?: string
  size: number
  type: string
  uploadedBy: string
  uploadedAt: Date
}

// ─── key helpers ─────────────────────────────────────────────────────────────

/**
 * Pattern for workspace file keys.
 * Format: `workspace/{workspaceId}/{timestamp}-{random}-{filename}`
 */
const WORKSPACE_KEY_PATTERN = /^workspace\/([a-f0-9-]{36})\/(\d+)-([a-z0-9]+)-(.+)$/

/** Return `true` when `key` matches the workspace file key pattern. */
export function matchesWorkspaceFilePattern(key: string): boolean {
  if (!key || key.startsWith('/api/') || key.startsWith('http')) {
    return false
  }
  return WORKSPACE_KEY_PATTERN.test(key)
}

/**
 * Extract the workspace ID embedded in a workspace file key.
 * Returns `null` when the key does not match the expected pattern or the
 * extracted ID is not a valid UUID.
 */
export function parseWorkspaceFileKey(key: string): string | null {
  const match = key.match(WORKSPACE_KEY_PATTERN)
  if (!match) return null
  const workspaceId = match[1]
  return isUuid(workspaceId) ? workspaceId : null
}

/**
 * Build a unique storage key for a new workspace file.
 * Format: `workspace/{workspaceId}/{timestamp}-{random}-{safeFileName}`
 */
export function generateWorkspaceFileKey(workspaceId: string, fileName: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 9)
  const safeFileName = sanitizeFileName(fileName)
  return `workspace/${workspaceId}/${timestamp}-${random}-${safeFileName}`
}

// ─── internal helpers ────────────────────────────────────────────────────────

/** Map a raw DB row to a `WorkspaceFileRecord`, using `fallbackWorkspaceId` when the
 *  stored `workspaceId` is null (should not happen for workspace-context files). */
async function rowToRecord(
  row: typeof workspaceFiles.$inferSelect,
  fallbackWorkspaceId: string
): Promise<WorkspaceFileRecord> {
  const { getServePathPrefix } = await import('@/lib/uploads')
  const prefix = getServePathPrefix()
  return {
    id: row.id,
    workspaceId: row.workspaceId ?? fallbackWorkspaceId,
    name: row.originalName,
    key: row.key,
    path: `${prefix}${encodeURIComponent(row.key)}?context=workspace`,
    size: row.size,
    type: row.contentType,
    uploadedBy: row.userId,
    uploadedAt: row.uploadedAt,
  }
}

/** Ensure or create the metadata record for a cloud-stored file. */
async function reconcileCloudMetadata(
  uploadKey: string,
  fileId: string,
  userId: string,
  workspaceId: string,
  fileName: string,
  contentType: string,
  fileSize: number
): Promise<string> {
  const existing = await getFileMetadataByKey(uploadKey, 'workspace')

  if (!existing) {
    logger.warn(`Metadata not found for cloud file ${uploadKey}, inserting…`)
    const record = await insertFileMetadata({
      id: fileId,
      key: uploadKey,
      userId,
      workspaceId,
      context: 'workspace',
      originalName: fileName,
      contentType,
      size: fileSize,
    })
    return record.id
  }

  logger.info(`Using existing metadata record for cloud file: ${uploadKey}`)
  return existing.id
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Check whether a file with the given name already exists in the workspace.
 */
export async function fileExistsInWorkspace(
  workspaceId: string,
  fileName: string
): Promise<boolean> {
  try {
    const rows = await db
      .select()
      .from(workspaceFiles)
      .where(
        and(
          eq(workspaceFiles.workspaceId, workspaceId),
          eq(workspaceFiles.originalName, fileName),
          eq(workspaceFiles.context, 'workspace')
        )
      )
      .limit(1)

    return rows.length > 0
  } catch (error) {
    logger.error(`Failed to check file existence for ${fileName}:`, error)
    return false
  }
}

/**
 * Upload a file to workspace-scoped storage and register its metadata.
 *
 * @throws When a file with the same name already exists in the workspace.
 */
export async function uploadWorkspaceFile(
  workspaceId: string,
  userId: string,
  fileBuffer: Buffer,
  fileName: string,
  contentType: string
): Promise<UserFile> {
  logger.info(`Uploading workspace file: ${fileName} for workspace ${workspaceId}`)

  const exists = await fileExistsInWorkspace(workspaceId, fileName)
  if (exists) {
    throw new Error(`A file named "${fileName}" already exists in this workspace`)
  }

  const storageKey = generateWorkspaceFileKey(workspaceId, fileName)
  let fileId = `wf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

  try {
    logger.info(`Generated storage key: ${storageKey}`)

    const uploadResult = await uploadFile({
      file: fileBuffer,
      fileName: storageKey,
      contentType,
      context: 'workspace',
      preserveKey: true,
      customKey: storageKey,
      metadata: {
        originalName: fileName,
        uploadedAt: new Date().toISOString(),
        purpose: 'workspace',
        userId,
        workspaceId,
      },
    })

    logger.info(`Upload returned key: ${uploadResult.key}`)

    if (hasCloudStorage()) {
      fileId = await reconcileCloudMetadata(
        uploadResult.key,
        fileId,
        userId,
        workspaceId,
        fileName,
        contentType,
        fileBuffer.length
      )
    } else {
      const record = await insertFileMetadata({
        id: fileId,
        key: uploadResult.key,
        userId,
        workspaceId,
        context: 'workspace',
        originalName: fileName,
        contentType,
        size: fileBuffer.length,
      })
      fileId = record.id
      logger.info(`Stored metadata in database for local file: ${uploadResult.key}`)
    }

    logger.info(`Successfully uploaded workspace file: ${fileName} with key: ${uploadResult.key}`)

    const { getServePathPrefix } = await import('@/lib/uploads')
    const prefix = getServePathPrefix()
    const serveUrl = `${prefix}${encodeURIComponent(uploadResult.key)}?context=workspace`

    return {
      id: fileId,
      name: fileName,
      size: fileBuffer.length,
      type: contentType,
      url: serveUrl,
      key: uploadResult.key,
      context: 'workspace',
    }
  } catch (error) {
    logger.error(`Failed to upload workspace file ${fileName}:`, error)
    throw new Error(
      `Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * List all files stored for a given workspace, ordered by upload time.
 */
export async function listWorkspaceFiles(workspaceId: string): Promise<WorkspaceFileRecord[]> {
  try {
    const rows = await db
      .select()
      .from(workspaceFiles)
      .where(
        and(eq(workspaceFiles.workspaceId, workspaceId), eq(workspaceFiles.context, 'workspace'))
      )
      .orderBy(workspaceFiles.uploadedAt)

    return Promise.all(rows.map((row) => rowToRecord(row, workspaceId)))
  } catch (error) {
    logger.error(`Failed to list workspace files for ${workspaceId}:`, error)
    return []
  }
}

/**
 * Retrieve a single workspace file record by ID.
 * Returns `null` when the file is not found.
 */
export async function getWorkspaceFile(
  workspaceId: string,
  fileId: string
): Promise<WorkspaceFileRecord | null> {
  try {
    const rows = await db
      .select()
      .from(workspaceFiles)
      .where(
        and(
          eq(workspaceFiles.id, fileId),
          eq(workspaceFiles.workspaceId, workspaceId),
          eq(workspaceFiles.context, 'workspace')
        )
      )
      .limit(1)

    if (rows.length === 0) return null
    return rowToRecord(rows[0], workspaceId)
  } catch (error) {
    logger.error(`Failed to get workspace file ${fileId}:`, error)
    return null
  }
}

/**
 * Download the raw bytes of a workspace file.
 */
export async function downloadWorkspaceFile(fileRecord: WorkspaceFileRecord): Promise<Buffer> {
  logger.info(`Downloading workspace file: ${fileRecord.name}`)

  try {
    const buffer = await downloadFile({ key: fileRecord.key, context: 'workspace' })
    logger.info(
      `Successfully downloaded workspace file: ${fileRecord.name} (${buffer.length} bytes)`
    )
    return buffer
  } catch (error) {
    logger.error(`Failed to download workspace file ${fileRecord.name}:`, error)
    throw new Error(
      `Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Delete a workspace file from both storage and the metadata database.
 *
 * @throws When the file record is not found, or deletion fails.
 */
export async function deleteWorkspaceFile(workspaceId: string, fileId: string): Promise<void> {
  logger.info(`Deleting workspace file: ${fileId}`)

  try {
    const fileRecord = await getWorkspaceFile(workspaceId, fileId)
    if (!fileRecord) {
      throw new Error('File not found')
    }

    await deleteFile({ key: fileRecord.key, context: 'workspace' })

    await db
      .delete(workspaceFiles)
      .where(
        and(
          eq(workspaceFiles.id, fileId),
          eq(workspaceFiles.workspaceId, workspaceId),
          eq(workspaceFiles.context, 'workspace')
        )
      )

    logger.info(`Successfully deleted workspace file: ${fileRecord.name}`)
  } catch (error) {
    logger.error(`Failed to delete workspace file ${fileId}:`, error)
    throw new Error(
      `Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

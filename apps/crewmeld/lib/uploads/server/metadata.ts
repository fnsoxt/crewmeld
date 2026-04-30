import { db } from '@crewmeld/db'
import { workspaceFiles } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, eq } from 'drizzle-orm'
import type { StorageContext } from '../shared/types'

const logger = createLogger('FileMetadata')

// ─── types ───────────────────────────────────────────────────────────────────

/** A file metadata record as returned from the database. */
export interface FileMetadataRecord {
  id: string
  key: string
  userId: string
  workspaceId: string | null
  context: string
  originalName: string
  contentType: string
  size: number
  uploadedAt: Date
}

/** Input shape for inserting a new file metadata record. */
export interface FileMetadataInsertOptions {
  key: string
  userId: string
  workspaceId?: string | null
  context: StorageContext
  originalName: string
  contentType: string
  size: number
  /** Optional — a UUID will be generated when omitted. */
  id?: string
}

/** Optional filters accepted by {@link getFileMetadataByContext}. */
export interface FileMetadataQueryOptions {
  context?: StorageContext
  workspaceId?: string
  userId?: string
}

// ─── row mapping ─────────────────────────────────────────────────────────────

/** Map a raw database row to a typed `FileMetadataRecord`. */
function toRecord(row: typeof workspaceFiles.$inferSelect): FileMetadataRecord {
  return {
    id: row.id,
    key: row.key,
    userId: row.userId,
    workspaceId: row.workspaceId,
    context: row.context,
    originalName: row.originalName,
    contentType: row.contentType,
    size: row.size,
    uploadedAt: row.uploadedAt,
  }
}

// ─── queries ─────────────────────────────────────────────────────────────────

/**
 * Look up an existing metadata record by storage key.
 * Returns `null` when no matching record exists.
 */
async function findByKey(key: string): Promise<FileMetadataRecord | null> {
  const rows = await db.select().from(workspaceFiles).where(eq(workspaceFiles.key, key)).limit(1)

  return rows.length > 0 ? toRecord(rows[0]) : null
}

// ─── mutations ───────────────────────────────────────────────────────────────

/**
 * Insert a new file metadata record, or return the existing one when the key
 * already exists (handles duplicate-key races gracefully).
 */
export async function insertFileMetadata(
  options: FileMetadataInsertOptions
): Promise<FileMetadataRecord> {
  const { key, userId, workspaceId, context, originalName, contentType, size, id } = options

  const existing = await findByKey(key)
  if (existing) {
    return existing
  }

  const fileId = id ?? (await import('uuid')).v4()

  try {
    await db.insert(workspaceFiles).values({
      id: fileId,
      key,
      userId,
      workspaceId: workspaceId ?? null,
      context,
      originalName,
      contentType,
      size,
      uploadedAt: new Date(),
    })

    return {
      id: fileId,
      key,
      userId,
      workspaceId: workspaceId ?? null,
      context,
      originalName,
      contentType,
      size,
      uploadedAt: new Date(),
    }
  } catch (error) {
    // Handle unique-constraint race: another request inserted the same key
    const isUniqueViolation =
      (error as { code?: string })?.code === '23505' ||
      (error instanceof Error && error.message.includes('unique'))

    if (isUniqueViolation) {
      const raceRecord = await findByKey(key)
      if (raceRecord) {
        return raceRecord
      }
    }

    logger.error(`Failed to insert file metadata for key: ${key}`, error)
    throw error
  }
}

/**
 * Retrieve a single metadata record by storage key, optionally filtered by
 * context.  Returns `null` when no match is found.
 */
export async function getFileMetadataByKey(
  key: string,
  context?: StorageContext
): Promise<FileMetadataRecord | null> {
  const conditions = [eq(workspaceFiles.key, key)]

  if (context) {
    conditions.push(eq(workspaceFiles.context, context))
  }

  const [row] = await db
    .select()
    .from(workspaceFiles)
    .where(conditions.length > 1 ? and(...conditions) : conditions[0])
    .limit(1)

  return row ? toRecord(row) : null
}

/**
 * Retrieve all metadata records for a given storage context, with optional
 * workspace and user filters.
 */
export async function getFileMetadataByContext(
  context: StorageContext,
  options?: FileMetadataQueryOptions
): Promise<FileMetadataRecord[]> {
  const conditions = [eq(workspaceFiles.context, context)]

  if (options?.workspaceId) {
    conditions.push(eq(workspaceFiles.workspaceId, options.workspaceId))
  }

  if (options?.userId) {
    conditions.push(eq(workspaceFiles.userId, options.userId))
  }

  const rows = await db
    .select()
    .from(workspaceFiles)
    .where(conditions.length > 1 ? and(...conditions) : conditions[0])
    .orderBy(workspaceFiles.uploadedAt)

  return rows.map(toRecord)
}

/**
 * Delete the metadata record for a given storage key.
 * Returns `true` regardless of whether a record was found.
 */
export async function deleteFileMetadata(key: string): Promise<boolean> {
  await db.delete(workspaceFiles).where(eq(workspaceFiles.key, key))
  return true
}

import { env } from '@/lib/core/config/env'
import type { StorageConfig, StorageContext } from '@/lib/uploads/shared/types'

export type { StorageConfig, StorageContext } from '@/lib/uploads/shared/types'

// ─── storage mode ────────────────────────────────────────────────────────────

/** Filesystem path prefix used by the local-storage fallback. */
export const UPLOAD_DIR = '/uploads'

/** True when both S3_BUCKET_NAME and AWS_REGION are present in the environment. */
export const USE_S3_STORAGE = !!(env.S3_BUCKET_NAME && env.AWS_REGION)

// ─── bucket configs ──────────────────────────────────────────────────────────

/** Default general-purpose bucket. */
export const S3_CONFIG = {
  bucket: env.S3_BUCKET_NAME || '',
  region: env.AWS_REGION || '',
}

/** Knowledge-base documents bucket. */
export const S3_KB_CONFIG = {
  bucket: env.S3_KB_BUCKET_NAME || '',
  region: env.AWS_REGION || '',
}

/** Execution-scoped temporary files bucket. */
export const S3_EXECUTION_FILES_CONFIG = {
  bucket: env.S3_EXECUTION_FILES_BUCKET_NAME || 'crewmeld-execution-files',
  region: env.AWS_REGION || '',
}

/** Chat-attachment bucket. */
export const S3_CHAT_CONFIG = {
  bucket: env.S3_CHAT_BUCKET_NAME || '',
  region: env.AWS_REGION || '',
}

/** Copilot-upload bucket. */
export const S3_COPILOT_CONFIG = {
  bucket: env.S3_COPILOT_BUCKET_NAME || '',
  region: env.AWS_REGION || '',
}

/** User profile-pictures bucket. */
export const S3_PROFILE_PICTURES_CONFIG = {
  bucket: env.S3_PROFILE_PICTURES_BUCKET_NAME || '',
  region: env.AWS_REGION || '',
}

/** Open-graph images bucket. */
export const S3_OG_IMAGES_CONFIG = {
  bucket: env.S3_OG_IMAGES_BUCKET_NAME || '',
  region: env.AWS_REGION || '',
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Return a human-readable label for the active storage backend.
 */
export function getStorageProvider(): 'S3' | 'Local' {
  return USE_S3_STORAGE ? 'S3' : 'Local'
}

/**
 * Return `true` when S3-compatible cloud storage (MinIO, AWS S3, etc.) is
 * active for this deployment.
 */
export function isUsingCloudStorage(): boolean {
  return USE_S3_STORAGE
}

/**
 * Select the S3 bucket/region pair that corresponds to a given storage context.
 * Falls back to the general-purpose bucket for unknown contexts.
 */
function resolveS3ConfigForContext(context: StorageContext): StorageConfig {
  switch (context) {
    case 'knowledge-base':
      return { bucket: S3_KB_CONFIG.bucket, region: S3_KB_CONFIG.region }
    case 'chat':
      return { bucket: S3_CHAT_CONFIG.bucket, region: S3_CHAT_CONFIG.region }
    case 'copilot':
      return { bucket: S3_COPILOT_CONFIG.bucket, region: S3_COPILOT_CONFIG.region }
    case 'execution':
      return {
        bucket: S3_EXECUTION_FILES_CONFIG.bucket,
        region: S3_EXECUTION_FILES_CONFIG.region,
      }
    case 'workspace':
      return { bucket: S3_CONFIG.bucket, region: S3_CONFIG.region }
    case 'profile-pictures':
      return {
        bucket: S3_PROFILE_PICTURES_CONFIG.bucket,
        region: S3_PROFILE_PICTURES_CONFIG.region,
      }
    case 'og-images':
      return {
        bucket: S3_OG_IMAGES_CONFIG.bucket || S3_CONFIG.bucket,
        region: S3_OG_IMAGES_CONFIG.region || S3_CONFIG.region,
      }
    default:
      return { bucket: S3_CONFIG.bucket, region: S3_CONFIG.region }
  }
}

/**
 * Return the `StorageConfig` appropriate for the given context and active
 * storage backend.  Returns an empty object when using local storage.
 */
export function getStorageConfig(context: StorageContext): StorageConfig {
  if (USE_S3_STORAGE) {
    return resolveS3ConfigForContext(context)
  }
  return {}
}

/**
 * Return `true` when the given storage context has a fully configured bucket.
 * Always returns `true` when using local storage.
 */
export function isStorageContextConfigured(context: StorageContext): boolean {
  if (!USE_S3_STORAGE) {
    return true
  }
  const cfg = getStorageConfig(context)
  return !!(cfg.bucket && cfg.region)
}

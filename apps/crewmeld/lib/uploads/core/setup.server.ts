import { existsSync } from 'fs'
import { mkdir } from 'fs/promises'
import path, { join } from 'path'
import { createLogger } from '@crewmeld/logger'
import { env } from '@/lib/core/config/env'
import { getStorageProvider, USE_S3_STORAGE } from '@/lib/uploads/config'

const logger = createLogger('UploadsSetup')

/** Absolute path to the local uploads directory on the server filesystem. */
export const UPLOAD_DIR_SERVER = join(path.resolve(process.cwd()), 'uploads')

// ─── directory initialisation ────────────────────────────────────────────────

/**
 * Ensure the local uploads directory exists.
 * No-ops (returns `true`) when S3 storage is active.
 */
export async function ensureUploadsDirectory(): Promise<boolean> {
  if (USE_S3_STORAGE) {
    logger.info('Using S3 storage — skipping local uploads directory creation')
    return true
  }

  try {
    if (existsSync(UPLOAD_DIR_SERVER)) {
      logger.info(`Uploads directory already exists at ${UPLOAD_DIR_SERVER}`)
    } else {
      await mkdir(UPLOAD_DIR_SERVER, { recursive: true })
      logger.info(`Created uploads directory at ${UPLOAD_DIR_SERVER}`)
    }
    return true
  } catch (error) {
    logger.error('Failed to create uploads directory:', error)
    return false
  }
}

// ─── startup side-effects ────────────────────────────────────────────────────

function logS3Warnings(): void {
  if (!env.S3_BUCKET_NAME || !env.AWS_REGION) {
    logger.warn('S3 storage configuration is incomplete')
    logger.warn('Set S3_BUCKET_NAME and AWS_REGION for S3 storage')
    return
  }

  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    logger.warn('AWS credentials are not set in environment variables')
    logger.warn('Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY for S3 storage')
    return
  }

  logger.info('AWS S3 credentials found in environment variables')
}

function logS3BucketDetails(): void {
  if (env.S3_KB_BUCKET_NAME) {
    logger.info(`S3 knowledge base bucket: ${env.S3_KB_BUCKET_NAME}`)
  }
  if (env.S3_COPILOT_BUCKET_NAME) {
    logger.info(`S3 copilot bucket: ${env.S3_COPILOT_BUCKET_NAME}`)
  }
}

if (typeof process !== 'undefined') {
  const provider = getStorageProvider()
  logger.info(`Storage provider: ${provider}`)

  if (USE_S3_STORAGE) {
    logS3Warnings()
    logS3BucketDetails()
  } else {
    logger.info('Using local file storage')
    ensureUploadsDirectory().then((ok) => {
      if (ok) {
        logger.info('Local uploads directory initialised')
      } else {
        logger.error('Failed to initialise local uploads directory')
      }
    })
  }
}

/**
 * File access authorization stub. Production-grade context-aware ACL
 * (workspace files, execution files, profile pictures, etc.) will be
 * ported in a later wave together with the file API routes. lib/uploads
 * imports only the function signature today.
 */

import { createLogger } from '@crewmeld/logger'
import type { StorageConfig, StorageContext } from '@/lib/uploads/shared/types'

const logger = createLogger('FileAuthorization')

/**
 * Verify that a user has access to a stored file.
 *
 * NOTE: Stub — currently returns true. The real implementation must
 * cross-check the file's metadata (workspace_id, owner) against the
 * caller's identity before exposing any cloud key.
 */
export async function verifyFileAccess(
  cloudKey: string,
  userId: string,
  customConfig?: StorageConfig,
  context?: StorageContext,
  isLocal?: boolean
): Promise<boolean> {
  logger.debug(
    `verifyFileAccess stub: key=${cloudKey} user=${userId} context=${context ?? 'inferred'} local=${isLocal ?? false}`
  )
  return true
}

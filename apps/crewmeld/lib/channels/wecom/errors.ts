import { createLogger } from '@crewmeld/logger'

const logger = createLogger('WeComErrors')

/**
 * WeCom API error code to human-readable message mapping
 * @see https://developer.work.weixin.qq.com/document/path/90313
 */
export const WECOM_ERROR_MESSAGES: Record<number, string> = {
  0: 'Operation successful',
  [-1]: 'System busy, please retry later',
  40001: 'Invalid CorpSecret, please check app credentials',
  40003: 'Invalid UserID',
  40004: 'Invalid media file type',
  40013: 'Invalid CorpID, please check enterprise ID',
  40014: 'Access Token invalid or expired',
  40056: 'Invalid AgentID, please check app ID',
  40071: 'Invalid department ID',
  41001: 'Missing Access Token parameter',
  41002: 'Missing CorpID parameter',
  41004: 'Missing CorpSecret parameter',
  41006: 'Missing media file ID',
  42001: 'Access Token expired, system will auto-refresh',
  42007: 'Pre-authorization code expired',
  43004: 'Recipient must follow the enterprise account',
  44002: 'Multimedia file is empty',
  45002: 'Message content too long',
  45009: 'API call rate limit exceeded',
  46003: 'Menu data not found',
  48002: 'API not authorized',
  48004: 'API deprecated',
  50001: 'UserID does not exist, please check member ID',
  60001: 'Department not found',
  60003: 'Department ID already exists',
  60011: 'Department name contains invalid characters',
  60104: 'Phone number already exists',
  60107: 'Invalid phone number',
  72023: 'Template ID does not exist',
  72024: 'Approval data format error',
  81013: 'UserID and OpenID mismatch',
  301002: 'No permission to operate on specified department',
}

/**
 * Get human-readable description for a WeCom error
 * @param errcode - WeCom error code
 * @param defaultMsg - default error message (from API raw errmsg)
 * @returns error description
 */
export function getWeComErrorMessage(errcode: number, defaultMsg: string): string {
  const message = WECOM_ERROR_MESSAGES[errcode]
  if (message) {
    return `[${errcode}] ${message}`
  }
  logger.warn('Unknown WeCom error code', { errcode, errmsg: defaultMsg })
  return `[${errcode}] ${defaultMsg}`
}

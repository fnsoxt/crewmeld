import { t } from '@/lib/core/server-i18n'

/** Platform role */
export type PlatformRole = 'super_admin' | 'admin' | 'member'

/** Role i18n key mapping */
const ROLE_LABEL_KEYS: Record<PlatformRole, Parameters<typeof t>[0]> = {
  super_admin: 'authRoleSuperAdmin',
  admin: 'authRoleAdmin',
  member: 'authRoleMember',
}

/** Get localized role display name */
export function getRoleLabel(role: PlatformRole, lang = 'zh'): string {
  return t(ROLE_LABEL_KEYS[role], lang)
}

/** Role color mapping (for UI badges) */
export const ROLE_COLORS: Record<PlatformRole, string> = {
  super_admin: 'bg-red-50 text-red-700',
  admin: 'bg-blue-50 text-blue-700',
  member: 'bg-gray-50 text-gray-700',
}

/** Approval status */
export type ApprovalStatus = 'approved' | 'pending' | 'rejected'

/** User list item */
export interface PlatformUser {
  id: string
  name: string
  email: string
  image: string | null
  role: PlatformRole
  isDisabled: boolean
  isSuperUser: boolean
  approvalStatus: ApprovalStatus
  lastLoginAt: string | null
  createdAt: string
}

/** User list API response */
export interface UserListResponse {
  success: boolean
  data: PlatformUser[]
}

/** Role change request */
export interface RoleChangeRequest {
  role: PlatformRole
}

/** Status change request */
export interface StatusChangeRequest {
  isDisabled: boolean
}

import type { MessageKey } from '@/lib/api/message-keys'

/** Role authorization check result */
export interface AuthCheckResult {
  authenticated: boolean
  userId: string | null
  role: PlatformRole | null
  /** i18n message key when authorization fails, otherwise null */
  error: MessageKey | null
}

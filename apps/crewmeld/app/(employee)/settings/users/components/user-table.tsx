'use client'

import { useState } from 'react'
import { createLogger } from '@crewmeld/logger'
import type { ApprovalStatus, PlatformRole, PlatformUser } from '@/lib/auth/rbac/types'
import { ROLE_COLORS } from '@/lib/auth/rbac/types'
import { PermissionGuard } from '@/app/(employee)/components/permission-guard'
import { useTranslation } from '@/hooks/use-translation'
import { useUsers } from '../hooks/use-users'
import { UserPermissionDialog } from './user-permission-dialog'
import { UserRoleDialog } from './user-role-dialog'
import { UserStatusToggle } from './user-status-toggle'

const logger = createLogger('UserTable')

// APPROVAL_LABELS resolved dynamically via t() in component

const APPROVAL_COLORS: Record<ApprovalStatus, string> = {
  approved: 'bg-green-50 text-green-700',
  pending: 'bg-amber-50 text-amber-700',
  rejected: 'bg-red-50 text-red-700',
}

export function UserTable() {
  const { t, locale } = useTranslation()

  const ROLE_LABELS: Record<PlatformRole, string> = {
    super_admin: t('settings.roleLabelSuperAdmin'),
    admin: t('settings.roleLabelAdmin'),
    member: t('settings.roleLabelMember'),
  }

  const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
    approved: t('settings.approvalApproved'),
    pending: t('settings.approvalPending'),
    rejected: t('settings.approvalRejected'),
  }

  const { data: users, isLoading, error, refetch } = useUsers()
  const [roleDialogUser, setRoleDialogUser] = useState<PlatformUser | null>(null)
  const [permDialogUser, setPermDialogUser] = useState<PlatformUser | null>(null)
  const [approvingUserId, setApprovingUserId] = useState<string | null>(null)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<PlatformUser | null>(null)
  const [deleteToast, setDeleteToast] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmUser) return
    try {
      setDeletingUserId(deleteConfirmUser.id)
      setDeleteConfirmUser(null)
      const res = await fetch(`/api/employee/users/${deleteConfirmUser.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setDeleteToast({ type: 'success', message: t('settings.userDeleted') })
        setTimeout(() => setDeleteToast(null), 3000)
        refetch()
      } else {
        setDeleteToast({ type: 'error', message: data.error ?? t('common.operationFailed') })
        setTimeout(() => setDeleteToast(null), 3000)
      }
    } catch {
      setDeleteToast({ type: 'error', message: t('common.operationFailed') })
      setTimeout(() => setDeleteToast(null), 3000)
    } finally {
      setDeletingUserId(null)
    }
  }

  const handleApproval = async (userId: string, status: 'approved' | 'rejected') => {
    try {
      setApprovingUserId(userId)
      const res = await fetch(`/api/employee/users/${userId}/approval`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (data.success) {
        refetch()
      } else {
        logger.error('Approval failed', { error: data.error })
      }
    } catch (err) {
      logger.error('Approval request failed', { error: err })
    } finally {
      setApprovingUserId(null)
    }
  }

  if (isLoading) {
    return (
      <div className='rounded-xl border border-gray-200 bg-white'>
        <div className='p-6'>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className='flex items-center gap-4 border-gray-100 border-b py-4 last:border-b-0'
            >
              <div className='h-10 w-10 animate-pulse rounded-full bg-gray-200' />
              <div className='flex-1 space-y-2'>
                <div className='h-4 w-1/4 animate-pulse rounded bg-gray-200' />
                <div className='h-3 w-1/3 animate-pulse rounded bg-gray-100' />
              </div>
              <div className='h-6 w-16 animate-pulse rounded bg-gray-100' />
              <div className='h-6 w-16 animate-pulse rounded bg-gray-100' />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className='flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 py-12'>
        <p className='text-red-600 text-sm'>{error}</p>
        <button
          onClick={refetch}
          className='rounded-lg bg-gray-600 px-4 py-2 font-medium text-sm text-white hover:bg-gray-700'
        >
          {t('common.retry')}
        </button>
      </div>
    )
  }

  if (!users || users.length === 0) {
    return (
      <div className='flex h-64 flex-col items-center justify-center rounded-xl border border-gray-300 border-dashed bg-white'>
        <p className='font-medium text-gray-900 text-sm'>{t('settings.userNoUsers')}</p>
        <p className='mt-1 text-gray-400 text-xs'>{t('settings.userNoUsersHint')}</p>
      </div>
    )
  }

  return (
    <div className='rounded-xl border border-gray-200 bg-white'>
      <div className='grid grid-cols-[2fr_2fr_1.5fr_1fr_1.5fr_0.5fr_1.5fr] gap-4 border-gray-200 border-b px-6 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide'>
        <div>{t('settings.userTableUser')}</div>
        <div>{t('settings.userTableEmail')}</div>
        <div>{t('settings.userTableRole')}</div>
        <div>{t('settings.userTableLastLogin')}</div>
        <div>{t('settings.userTableApprovalStatus')}</div>
        <div>{t('settings.userTableStatus')}</div>
        <div />
      </div>

      {users.map((user) => {
        const roleColor = ROLE_COLORS[user.role] ?? 'bg-gray-50 text-gray-700'
        const roleLabel = ROLE_LABELS[user.role] ?? user.role
        const lastLogin = user.lastLoginAt
          ? new Date(user.lastLoginAt).toLocaleDateString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            })
          : '--'

        return (
          <div
            key={user.id}
            className={`grid grid-cols-[2fr_2fr_1.5fr_1fr_1.5fr_0.5fr_1.5fr] items-center gap-4 border-gray-100 border-b px-6 py-4 last:border-b-0 ${
              user.isDisabled ? 'opacity-50' : ''
            }`}
          >
            <div className='flex items-center gap-3'>
              <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 font-medium text-gray-600 text-sm'>
                {user.image ? (
                  <img
                    src={user.image}
                    alt={user.name}
                    className='h-9 w-9 rounded-full object-cover'
                  />
                ) : (
                  user.name.slice(0, 1)
                )}
              </div>
              <span className='truncate font-medium text-gray-900 text-sm'>{user.name}</span>
            </div>

            <div className='truncate text-gray-500 text-sm'>{user.email}</div>

            <div>
              <button
                type='button'
                onClick={() => setRoleDialogUser(user)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium text-xs transition-opacity hover:opacity-80 ${roleColor}`}
                title={t('settings.userClickToChangeRole')}
              >
                {roleLabel}
                <svg className='h-3 w-3' viewBox='0 0 12 12' fill='none'>
                  <path
                    d='M3 5l3 3 3-3'
                    stroke='currentColor'
                    strokeWidth='1.5'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                  />
                </svg>
              </button>
            </div>

            <div className='text-gray-400 text-xs'>{lastLogin}</div>

            <div className='flex items-center gap-2'>
              <span
                className={`inline-flex shrink-0 rounded-full px-2 py-0.5 font-medium text-xs ${
                  APPROVAL_COLORS[user.approvalStatus] ?? APPROVAL_COLORS.approved
                }`}
              >
                {APPROVAL_LABELS[user.approvalStatus] ?? APPROVAL_LABELS.approved}
              </span>
              {user.approvalStatus === 'pending' && (
                <>
                  <button
                    type='button'
                    disabled={approvingUserId === user.id}
                    onClick={() => handleApproval(user.id, 'approved')}
                    className='rounded bg-green-50 px-1.5 py-0.5 font-medium text-green-700 text-xs hover:bg-green-100 disabled:opacity-50'
                  >
                    {t('settings.approvalApprove')}
                  </button>
                  <button
                    type='button'
                    disabled={approvingUserId === user.id}
                    onClick={() => handleApproval(user.id, 'rejected')}
                    className='rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-700 text-xs hover:bg-red-100 disabled:opacity-50'
                  >
                    {t('settings.approvalReject')}
                  </button>
                </>
              )}
            </div>

            <div>
              <UserStatusToggle userId={user.id} isDisabled={user.isDisabled} onToggled={refetch} />
            </div>

            <div className='flex items-center gap-1.5'>
              <button
                type='button'
                onClick={() => setPermDialogUser(user)}
                className='rounded-lg border border-gray-200 px-2 py-1 font-medium text-gray-600 text-xs hover:bg-gray-50'
              >
                {t('settings.viewPermissions')}
              </button>
              <PermissionGuard requires='user:role_edit'>
                <button
                  type='button'
                  onClick={() => setDeleteConfirmUser(user)}
                  disabled={deletingUserId === user.id || user.isSuperUser}
                  className='rounded-lg border border-red-200 px-2 py-1 font-medium text-red-600 text-xs hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50'
                  title={
                    user.isSuperUser ? t('settings.userCannotDeleteSuperAdmin') : t('common.delete')
                  }
                >
                  {t('common.delete')}
                </button>
              </PermissionGuard>
            </div>
          </div>
        )
      })}

      {roleDialogUser && (
        <UserRoleDialog
          user={roleDialogUser}
          onClose={() => setRoleDialogUser(null)}
          onConfirmed={refetch}
        />
      )}

      {permDialogUser && (
        <UserPermissionDialog
          userName={permDialogUser.name}
          userRole={permDialogUser.role}
          onClose={() => setPermDialogUser(null)}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirmUser && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/40'
          onClick={() => setDeleteConfirmUser(null)}
        >
          <div
            className='mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-red-100'>
              <svg className='h-5 w-5 text-red-600' viewBox='0 0 20 20' fill='none'>
                <path
                  d='M10 6v4m0 4h.01M3.072 17h13.856c1.054 0 1.708-1.14 1.181-2.058L11.18 3.058a1.333 1.333 0 00-2.36 0L1.891 14.942C1.364 15.86 2.018 17 3.072 17z'
                  stroke='currentColor'
                  strokeWidth='1.5'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                />
              </svg>
            </div>
            <h3 className='mt-3 font-semibold text-base text-gray-900'>
              {t('common.confirmDelete')}
            </h3>
            <p className='mt-2 text-gray-500 text-sm'>
              {t('settings.userDeleteConfirm', { name: deleteConfirmUser.name })}
            </p>
            <div className='mt-5 flex justify-end gap-3'>
              <button
                type='button'
                onClick={() => setDeleteConfirmUser(null)}
                className='rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 text-sm hover:bg-gray-50'
              >
                {t('common.cancel')}
              </button>
              <button
                type='button'
                onClick={handleDeleteConfirm}
                className='rounded-lg bg-red-600 px-4 py-2 font-medium text-sm text-white hover:bg-red-700'
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteToast && (
        <div
          className={`-translate-x-1/2 fixed top-16 left-1/2 z-50 rounded-xl border px-5 py-3 shadow-lg ${
            deleteToast.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          <span className='font-medium text-sm'>{deleteToast.message}</span>
        </div>
      )}
    </div>
  )
}

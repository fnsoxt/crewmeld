'use client'

import { useState } from 'react'
import type { PlatformRole, PlatformUser } from '@/lib/auth/rbac/types'
import { useTranslation } from '@/hooks/use-translation'

interface UserRoleDialogProps {
  user: PlatformUser
  onClose: () => void
  onConfirmed: () => void
}

const ROLES: PlatformRole[] = ['super_admin', 'admin', 'member']

export function UserRoleDialog({ user, onClose, onConfirmed }: UserRoleDialogProps) {
  const { t } = useTranslation()
  const ROLE_LABELS: Record<PlatformRole, string> = {
    super_admin: t('settings.roleLabelSuperAdmin'),
    admin: t('settings.roleLabelAdmin'),
    member: t('settings.roleLabelMember'),
  }
  const ROLE_DESCRIPTIONS: Record<PlatformRole, string> = {
    super_admin: t('settings.roleDescSuperAdmin'),
    admin: t('settings.roleDescAdmin'),
    member: t('settings.roleDescMember'),
  }
  const [selectedRole, setSelectedRole] = useState<PlatformRole>(user.role)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasChanged = selectedRole !== user.role

  const handleConfirm = async () => {
    if (!hasChanged) {
      onClose()
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`/api/employee/users/${user.id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedRole }),
      })

      const result = await response.json()
      if (!result.success) {
        setError(result.error ?? t('settings.roleChangeFailed'))
        return
      }

      onConfirmed()
      onClose()
    } catch {
      setError(t('common.networkError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className='fixed inset-0 z-40 flex items-center justify-center bg-black/30'
      onClick={onClose}
    >
      <div
        className='relative w-[440px] rounded-2xl bg-white p-6 shadow-2xl'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='mb-4 flex items-center justify-between'>
          <h2 className='font-semibold text-gray-900 text-lg'>{t('settings.roleDialogTitle')}</h2>
          <button
            onClick={onClose}
            className='rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          >
            &#x2715;
          </button>
        </div>

        <p className='mb-4 text-gray-500 text-sm'>
          {t('settings.roleDialogAssign', { name: user.name })}
        </p>

        {error && <div className='mb-3 rounded-lg bg-red-50 p-3 text-red-600 text-sm'>{error}</div>}

        <div className='mb-6 space-y-2'>
          {ROLES.map((role) => (
            <label
              key={role}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                selectedRole === role
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type='radio'
                name='role'
                value={role}
                checked={selectedRole === role}
                onChange={() => setSelectedRole(role)}
                className='mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500'
              />
              <div>
                <span className='font-medium text-gray-900 text-sm'>{ROLE_LABELS[role]}</span>
                <p className='mt-0.5 text-gray-500 text-xs'>{ROLE_DESCRIPTIONS[role]}</p>
              </div>
            </label>
          ))}
        </div>

        <div className='flex justify-end gap-3'>
          <button
            onClick={onClose}
            className='rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 text-sm hover:bg-gray-50'
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting || !hasChanged}
            className='rounded-lg bg-blue-600 px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
          >
            {isSubmitting ? t('common.submitting') : t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

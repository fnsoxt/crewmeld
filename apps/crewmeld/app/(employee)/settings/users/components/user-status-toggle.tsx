'use client'

import { useState } from 'react'
import { useTranslation } from '@/hooks/use-translation'

interface UserStatusToggleProps {
  userId: string
  isDisabled: boolean
  onToggled: () => void
}

export function UserStatusToggle({ userId, isDisabled, onToggled }: UserStatusToggleProps) {
  const { t } = useTranslation()
  const [isUpdating, setIsUpdating] = useState(false)
  const [hasError, setHasError] = useState(false)

  const handleToggle = async () => {
    setIsUpdating(true)
    setHasError(false)
    try {
      const response = await fetch(`/api/employee/users/${userId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDisabled: !isDisabled }),
      })

      const result = await response.json()
      if (result.success) {
        onToggled()
      } else {
        setHasError(true)
        setTimeout(() => setHasError(false), 2000)
      }
    } catch {
      setHasError(true)
      setTimeout(() => setHasError(false), 2000)
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className='flex items-center gap-1.5'>
      <button
        type='button'
        onClick={handleToggle}
        disabled={isUpdating}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
          hasError ? 'bg-red-400' : isDisabled ? 'bg-gray-300' : 'bg-blue-600'
        }`}
        title={
          hasError
            ? t('common.operationFailed')
            : isDisabled
              ? t('settings.userStatusEnable')
              : t('settings.userStatusDisable')
        }
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            isDisabled ? 'translate-x-1' : 'translate-x-[18px]'
          }`}
        />
      </button>
      {hasError && <span className='text-red-500 text-xs'>{t('common.operationFailed')}</span>}
    </div>
  )
}

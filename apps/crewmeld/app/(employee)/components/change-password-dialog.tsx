'use client'

import { useState } from 'react'
import { createLogger } from '@crewmeld/logger'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { client, signOut } from '@/lib/auth/auth-client'
import { useTranslation } from '@/hooks/use-translation'

const logger = createLogger('ChangePasswordDialog')

interface ChangePasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const { t } = useTranslation()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const reset = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError(null)
    setSuccess(false)
  }

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      reset()
    }
    onOpenChange(value)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError(t('changePassword.minLength'))
      return
    }

    if (newPassword !== confirmPassword) {
      setError(t('changePassword.mismatch'))
      return
    }

    setIsSubmitting(true)
    try {
      const res = await client.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: false,
      })

      if (res.error) {
        const msg = res.error.message?.toLowerCase() ?? ''
        if (msg.includes('invalid password') || msg.includes('incorrect password')) {
          setError(t('changePassword.invalidPassword'))
        } else {
          setError(t('changePassword.failed'))
        }
        return
      }

      setSuccess(true)
      setTimeout(() => {
        signOut({ fetchOptions: { onSuccess: () => window.location.replace('/login') } })
      }, 1500)
    } catch (err) {
      logger.error('Change password failed', { error: err })
      setError(t('changePassword.failedRetry'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={success ? undefined : handleOpenChange}>
      <DialogContent
        className='sm:max-w-md'
        onPointerDownOutside={success ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader>
          <DialogTitle>{t('changePassword.title')}</DialogTitle>
          <DialogDescription>{t('changePassword.description')}</DialogDescription>
        </DialogHeader>

        {success ? (
          <div className='rounded-lg bg-green-50 px-4 py-3 text-green-700 text-sm'>
            {t('changePassword.success')}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className='space-y-4'>
            <div>
              <label
                htmlFor='current-password'
                className='mb-1 block font-medium text-gray-700 text-sm'
              >
                {t('changePassword.currentPassword')}
              </label>
              <input
                id='current-password'
                type='password'
                required
                autoComplete='current-password'
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
              />
            </div>

            <div>
              <label
                htmlFor='new-password'
                className='mb-1 block font-medium text-gray-700 text-sm'
              >
                {t('changePassword.newPassword')}
              </label>
              <input
                id='new-password'
                type='password'
                required
                autoComplete='new-password'
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
                placeholder={t('changePassword.placeholder')}
              />
            </div>

            <div>
              <label
                htmlFor='confirm-password'
                className='mb-1 block font-medium text-gray-700 text-sm'
              >
                {t('changePassword.confirmNewPassword')}
              </label>
              <input
                id='confirm-password'
                type='password'
                required
                autoComplete='new-password'
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
              />
            </div>

            {error && (
              <div className='rounded-lg bg-red-50 px-3 py-2 text-red-600 text-sm'>{error}</div>
            )}

            <DialogFooter>
              <button
                type='button'
                onClick={() => handleOpenChange(false)}
                className='rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 text-sm hover:bg-gray-50'
              >
                {t('common.cancel')}
              </button>
              <button
                type='submit'
                disabled={isSubmitting}
                className='rounded-lg bg-blue-600 px-4 py-2 font-medium text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
              >
                {isSubmitting ? t('common.submitting') : t('changePassword.confirmModify')}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

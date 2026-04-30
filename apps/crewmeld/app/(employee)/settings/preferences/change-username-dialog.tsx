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
import { client, useSession } from '@/lib/auth/auth-client'
import { useTranslation } from '@/hooks/use-translation'

const logger = createLogger('ChangeUsernameDialog')

interface ChangeUsernameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentName: string
}

export function ChangeUsernameDialog({
  open,
  onOpenChange,
  currentName,
}: ChangeUsernameDialogProps) {
  const { t } = useTranslation()
  const { refetch } = useSession()
  const [name, setName] = useState(currentName)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const reset = () => {
    setName(currentName)
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

    const trimmed = name.trim()
    if (!trimmed || trimmed === currentName) return

    setIsSubmitting(true)
    try {
      await client.updateUser({ name: trimmed })
      await refetch()
      setSuccess(true)
      setTimeout(() => handleOpenChange(false), 1500)
    } catch (err) {
      logger.error('Change username failed', { error: err })
      setError(t('settings.preferencesUsernameFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('settings.preferencesUsernameDialogTitle')}</DialogTitle>
          <DialogDescription>{t('settings.preferencesUsernameDialogDesc')}</DialogDescription>
        </DialogHeader>

        {success ? (
          <div className='rounded-lg bg-green-50 px-4 py-3 text-green-700 text-sm'>
            {t('settings.preferencesUsernameSaved')}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className='space-y-4'>
            <div>
              <label
                htmlFor='new-username'
                className='mb-1 block font-medium text-gray-700 text-sm'
              >
                {t('settings.preferencesUsernameLabel')}
              </label>
              <input
                id='new-username'
                type='text'
                required
                autoComplete='username'
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setError(null)
                }}
                placeholder={t('settings.preferencesUsernamePlaceholder')}
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
                disabled={isSubmitting || name.trim() === currentName || !name.trim()}
                className='rounded-lg bg-blue-600 px-4 py-2 font-medium text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
              >
                {isSubmitting ? t('common.submitting') : t('common.confirm')}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/core/utils/cn'
import { inter } from '@/app/_styles/fonts/inter/inter'
import { BrandedButton } from '@/app/(auth)/components/branded-button'
import { useTranslation } from '@/hooks/use-translation'

interface RequestResetFormProps {
  email: string
  onEmailChange: (email: string) => void
  onSubmit: (email: string) => Promise<void>
  isSubmitting: boolean
  statusType: 'success' | 'error' | null
  statusMessage: string
  className?: string
}

/** Form for requesting a password-reset email. */
export function RequestResetForm({
  email,
  onEmailChange,
  onSubmit,
  isSubmitting,
  statusType,
  statusMessage,
  className,
}: RequestResetFormProps) {
  const { t } = useTranslation()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit(email)
  }

  return (
    <form onSubmit={handleSubmit} className={cn(`${inter.className} space-y-8`, className)}>
      <div className='space-y-6'>
        <div className='space-y-2'>
          <Label htmlFor='reset-email'>{t('auth.email')}</Label>
          <Input
            id='reset-email'
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder={t('auth.emailPlaceholder')}
            type='email'
            disabled={isSubmitting}
            required
            className='rounded-[10px] shadow-sm transition-colors focus:border-gray-400 focus:ring-2 focus:ring-gray-100'
          />
          <p className='text-muted-foreground text-sm'>{t('auth.resetEmailHint')}</p>
        </div>

        {statusType && statusMessage && (
          <div
            className={cn('text-xs', statusType === 'success' ? 'text-[#4CAF50]' : 'text-red-400')}
          >
            <p>{statusMessage}</p>
          </div>
        )}
      </div>

      <BrandedButton
        type='submit'
        disabled={isSubmitting}
        loading={isSubmitting}
        loadingText={t('auth.sending')}
      >
        {t('auth.sendResetLink')}
      </BrandedButton>
    </form>
  )
}

interface SetNewPasswordFormProps {
  token: string | null
  onSubmit: (password: string) => Promise<void>
  isSubmitting: boolean
  statusType: 'success' | 'error' | null
  statusMessage: string
  className?: string
}

/** Ordered list of client-side password validation rules. */
const PASSWORD_RULES: Array<{ test: (p: string) => boolean; messageKey: string }> = [
  { test: (p) => p.length >= 8, messageKey: 'auth.passwordTooShort' },
  { test: (p) => p.length <= 100, messageKey: 'auth.passwordMaxLength' },
  { test: (p) => /[A-Z]/.test(p), messageKey: 'auth.passwordNeedUppercase' },
  { test: (p) => /[a-z]/.test(p), messageKey: 'auth.passwordNeedLowercase' },
  { test: (p) => /[0-9]/.test(p), messageKey: 'auth.passwordNeedNumber' },
  { test: (p) => /[^A-Za-z0-9]/.test(p), messageKey: 'auth.passwordNeedSpecial' },
]

/** Password toggle button shared across new-password fields. */
function ToggleVisibility({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <button
      type='button'
      onClick={onToggle}
      className='-translate-y-1/2 absolute top-1/2 right-3 text-gray-500 transition hover:text-gray-700'
      aria-label={visible ? 'Hide password' : 'Show password'}
    >
      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  )
}

/** Form for setting a new password using a reset token. */
export function SetNewPasswordForm({
  token,
  onSubmit,
  isSubmitting,
  statusType,
  statusMessage,
  className,
}: SetNewPasswordFormProps) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [validationMessage, setValidationMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const errorInputClass =
    'border-red-500 focus:border-red-500 focus:ring-red-100 focus-visible:ring-red-500'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate against each rule in order; stop at first failure.
    for (const rule of PASSWORD_RULES) {
      if (!rule.test(password)) {
        setValidationMessage(t(rule.messageKey))
        return
      }
    }

    if (password !== confirmPassword) {
      setValidationMessage(t('auth.passwordMismatch'))
      return
    }

    setValidationMessage('')
    await onSubmit(password)
  }

  return (
    <form onSubmit={handleSubmit} className={cn(`${inter.className} space-y-8`, className)}>
      <div className='space-y-6'>
        <div className='space-y-2'>
          <Label htmlFor='password'>{t('auth.newPasswordLabel')}</Label>
          <div className='relative'>
            <Input
              id='password'
              type={showPassword ? 'text' : 'password'}
              autoCapitalize='none'
              autoComplete='new-password'
              autoCorrect='off'
              disabled={isSubmitting || !token}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder={t('auth.newPasswordPlaceholder')}
              className={cn(
                'rounded-[10px] pr-10 shadow-sm transition-colors focus:border-gray-400 focus:ring-2 focus:ring-gray-100',
                validationMessage && errorInputClass
              )}
            />
            <ToggleVisibility visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
          </div>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='confirmPassword'>{t('auth.confirmPasswordLabel')}</Label>
          <div className='relative'>
            <Input
              id='confirmPassword'
              type={showConfirm ? 'text' : 'password'}
              autoCapitalize='none'
              autoComplete='new-password'
              autoCorrect='off'
              disabled={isSubmitting || !token}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder={t('auth.confirmNewPasswordPlaceholder')}
              className={cn(
                'rounded-[10px] pr-10 shadow-sm transition-colors focus:border-gray-400 focus:ring-2 focus:ring-gray-100',
                validationMessage && errorInputClass
              )}
            />
            <ToggleVisibility visible={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />
          </div>
        </div>

        {validationMessage && (
          <div className='mt-1 space-y-1 text-red-400 text-xs'>
            <p>{validationMessage}</p>
          </div>
        )}

        {statusType && statusMessage && (
          <div
            className={cn(
              'mt-1 space-y-1 text-xs',
              statusType === 'success' ? 'text-[#4CAF50]' : 'text-red-400'
            )}
          >
            <p>{statusMessage}</p>
          </div>
        )}
      </div>

      <BrandedButton
        type='submit'
        disabled={isSubmitting || !token}
        loading={isSubmitting}
        loadingText={t('auth.resetting')}
      >
        {t('auth.resetPasswordButton')}
      </BrandedButton>
    </form>
  )
}

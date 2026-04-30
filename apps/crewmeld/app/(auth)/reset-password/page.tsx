'use client'

import { Suspense, useEffect, useState } from 'react'
import { createLogger } from '@crewmeld/logger'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { inter } from '@/app/_styles/fonts/inter/inter'
import { soehne } from '@/app/_styles/fonts/soehne/soehne'
import { SetNewPasswordForm } from '@/app/(auth)/reset-password/reset-password-form'
import { useTranslation } from '@/hooks/use-translation'

const logger = createLogger('ResetPasswordPage')

/** Shape for the page-level status banner. */
interface StatusState {
  type: 'success' | 'error' | null
  text: string
}

const INITIAL_STATUS: StatusState = { type: null, text: '' }

function ResetPasswordContent() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState<StatusState>(INITIAL_STATUS)

  // Show an immediate error when no token is present in the URL.
  useEffect(() => {
    if (!token) {
      setStatus({ type: 'error', text: t('auth.resetTokenInvalid') })
    }
  }, [token, t])

  const handleResetPassword = async (password: string) => {
    setIsSubmitting(true)
    setStatus(INITIAL_STATUS)

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      })

      if (!res.ok) {
        const errData = (await res.json()) as Record<string, unknown>
        throw new Error(
          typeof errData.message === 'string' ? errData.message : t('auth.passwordResetFailed')
        )
      }

      setStatus({ type: 'success', text: t('auth.passwordResetSuccessRedirecting') })

      setTimeout(() => {
        router.push('/login?resetSuccess=true')
      }, 1500)
    } catch (err) {
      logger.error('Error resetting password', { error: err })
      setStatus({
        type: 'error',
        text: err instanceof Error ? err.message : t('auth.passwordResetFailed'),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <div className='space-y-1 text-center'>
        <h1 className={`${soehne.className} font-medium text-[32px] text-black tracking-tight`}>
          {t('auth.resetPassword')}
        </h1>
        <p className={`${inter.className} font-[380] text-[16px] text-muted-foreground`}>
          {t('auth.setNewPassword')}
        </p>
      </div>

      <div className={`${inter.className} mt-8`}>
        <SetNewPasswordForm
          token={token}
          onSubmit={handleResetPassword}
          isSubmitting={isSubmitting}
          statusType={status.type}
          statusMessage={status.text}
        />
      </div>

      <div className={`${inter.className} pt-6 text-center font-light text-[14px]`}>
        <Link
          href='/login'
          className='font-medium text-[var(--brand-accent-hex)] underline-offset-4 transition hover:text-[var(--brand-accent-hover-hex)] hover:underline'
        >
          {t('auth.backToLogin')}
        </Link>
      </div>
    </>
  )
}

export default function ResetPasswordPage() {
  const { t } = useTranslation()
  return (
    <Suspense
      fallback={
        <div className='flex h-screen items-center justify-center'>{t('common.loading')}</div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  )
}

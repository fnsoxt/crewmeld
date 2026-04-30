'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { cn } from '@/lib/core/utils/cn'
import { inter } from '@/app/_styles/fonts/inter/inter'
import { soehne } from '@/app/_styles/fonts/soehne/soehne'
import { useVerification } from '@/app/(auth)/verify/use-verification'
import { useBrandedButtonClass } from '@/hooks/use-branded-button-class'
import { useTranslation } from '@/hooks/use-translation'

interface VerifyContentProps {
  hasEmailService: boolean
  isProduction: boolean
  isEmailVerificationEnabled: boolean
}

/** Shared class string for each OTP digit slot. */
const OTP_SLOT_BASE =
  '!rounded-[10px] h-12 w-12 border bg-white text-center font-medium text-lg shadow-sm transition-all duration-200 border-gray-300 hover:border-gray-400 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-100'

const OTP_SLOT_ERROR = 'border-red-500 focus:border-red-500 focus:ring-red-100'

/** Render a single OTP digit slot with optional error styling. */
function OtpSlot({ index, isInvalidOtp }: { index: number; isInvalidOtp: boolean }) {
  return (
    <InputOTPSlot index={index} className={cn(OTP_SLOT_BASE, isInvalidOtp && OTP_SLOT_ERROR)} />
  )
}

function VerificationForm({
  hasEmailService,
  isProduction,
  isEmailVerificationEnabled,
}: {
  hasEmailService: boolean
  isProduction: boolean
  isEmailVerificationEnabled: boolean
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const buttonClass = useBrandedButtonClass()

  const {
    otp,
    email,
    isLoading,
    isVerified,
    isInvalidOtp,
    errorMessage,
    isOtpComplete,
    verifyCode,
    resendCode,
    handleOtpChange,
  } = useVerification({ hasEmailService, isProduction, isEmailVerificationEnabled })

  const [countdown, setCountdown] = useState(0)
  const [resendDisabled, setResendDisabled] = useState(false)

  useEffect(() => {
    if (countdown <= 0) {
      if (resendDisabled) setResendDisabled(false)
      return
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown, resendDisabled])

  const handleResend = () => {
    resendCode()
    setResendDisabled(true)
    setCountdown(30)
  }

  const descriptionText = (() => {
    if (isVerified) return t('auth.emailVerifiedRedirecting')
    if (!isEmailVerificationEnabled) return t('auth.emailVerificationDisabled')
    if (hasEmailService) return t('auth.verificationCodeSentTo', { email: email || '' })
    if (!isProduction) return t('auth.devModeCheckConsole')
    return t('auth.emailServiceNotConfigured')
  })()

  return (
    <>
      <div className='space-y-1 text-center'>
        <h1 className={`${soehne.className} font-medium text-[32px] text-black tracking-tight`}>
          {isVerified ? t('auth.emailVerified') : t('auth.verifyYourEmail')}
        </h1>
        <p className={`${inter.className} font-[380] text-[16px] text-muted-foreground`}>
          {descriptionText}
        </p>
      </div>

      {!isVerified && isEmailVerificationEnabled && (
        <div className={`${inter.className} mt-8 space-y-8`}>
          <div className='space-y-6'>
            <p className='text-center text-muted-foreground text-sm'>
              {t('auth.enterVerificationCode')}
              {hasEmailService ? ` ${t('auth.checkSpamFolder')}` : ''}
            </p>

            <div className='flex justify-center'>
              <InputOTP
                maxLength={6}
                value={otp}
                onChange={handleOtpChange}
                disabled={isLoading}
                className={cn('gap-2', isInvalidOtp && 'otp-error')}
              >
                <InputOTPGroup className='[&>div]:!rounded-[10px] gap-2'>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <OtpSlot key={i} index={i} isInvalidOtp={isInvalidOtp} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>

            {errorMessage && (
              <div className='mt-1 space-y-1 text-center text-red-400 text-xs'>
                <p>{errorMessage}</p>
              </div>
            )}
          </div>

          <Button
            onClick={verifyCode}
            className={`${buttonClass} flex w-full items-center justify-center gap-2 rounded-[10px] border font-medium text-[15px] text-white transition-all duration-200`}
            disabled={!isOtpComplete || isLoading}
          >
            {isLoading ? t('auth.verifying') : t('auth.verifyEmail')}
          </Button>

          {hasEmailService && (
            <div className='text-center'>
              <p className='text-muted-foreground text-sm'>
                {t('auth.didNotReceiveCode')}{' '}
                {countdown > 0 ? (
                  <span>
                    <span className='font-medium text-foreground'>{countdown}</span>{' '}
                    {t('auth.resendIn')}
                  </span>
                ) : (
                  <button
                    className='font-medium text-[var(--brand-accent-hex)] underline-offset-4 transition hover:text-[var(--brand-accent-hover-hex)] hover:underline'
                    onClick={handleResend}
                    disabled={isLoading || resendDisabled}
                  >
                    {t('auth.resend')}
                  </button>
                )}
              </p>
            </div>
          )}

          <div className='text-center font-light text-[14px]'>
            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  sessionStorage.removeItem('verificationEmail')
                  sessionStorage.removeItem('inviteRedirectUrl')
                  sessionStorage.removeItem('isInviteFlow')
                }
                router.push('/signup')
              }}
              className='font-medium text-[var(--brand-accent-hex)] underline-offset-4 transition hover:text-[var(--brand-accent-hover-hex)] hover:underline'
            >
              {t('auth.backToSignup')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function VerificationFormFallback() {
  return (
    <div className='text-center'>
      <div className='animate-pulse'>
        <div className='mx-auto mb-4 h-8 w-48 rounded bg-gray-200' />
        <div className='mx-auto h-4 w-64 rounded bg-gray-200' />
      </div>
    </div>
  )
}

export function VerifyContent({
  hasEmailService,
  isProduction,
  isEmailVerificationEnabled,
}: VerifyContentProps) {
  return (
    <Suspense fallback={<VerificationFormFallback />}>
      <VerificationForm
        hasEmailService={hasEmailService}
        isProduction={isProduction}
        isEmailVerificationEnabled={isEmailVerificationEnabled}
      />
    </Suspense>
  )
}

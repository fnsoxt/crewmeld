'use client'

import { useEffect, useState } from 'react'
import { createLogger } from '@crewmeld/logger'
import { useRouter, useSearchParams } from 'next/navigation'
import { client, useSession } from '@/lib/auth/auth-client'

const logger = createLogger('useVerification')

interface UseVerificationParams {
  hasEmailService: boolean
  isProduction: boolean
  isEmailVerificationEnabled: boolean
}

interface UseVerificationReturn {
  otp: string
  email: string
  isLoading: boolean
  isVerified: boolean
  isInvalidOtp: boolean
  errorMessage: string
  isOtpComplete: boolean
  hasEmailService: boolean
  isProduction: boolean
  isEmailVerificationEnabled: boolean
  verifyCode: () => Promise<void>
  resendCode: () => void
  handleOtpChange: (value: string) => void
}

/** Map an OTP verification error to a user-friendly message. */
function classifyOtpError(err: unknown): string {
  const msg = err instanceof Error ? err.message : ''
  if (msg.includes('expired')) return 'The verification code has expired. Please request a new one.'
  if (msg.includes('invalid')) return 'Invalid verification code. Please check and try again.'
  if (msg.includes('attempts')) return 'Too many failed attempts. Please request a new code.'
  return 'Verification failed. Please check your code and try again.'
}

/** Read and clear invite-flow data from sessionStorage. */
function readInviteSession(): { email: string; redirectUrl: string | null; isInviteFlow: boolean } {
  if (typeof window === 'undefined') {
    return { email: '', redirectUrl: null, isInviteFlow: false }
  }
  return {
    email: sessionStorage.getItem('verificationEmail') ?? '',
    redirectUrl: sessionStorage.getItem('inviteRedirectUrl'),
    isInviteFlow: sessionStorage.getItem('isInviteFlow') === 'true',
  }
}

/** Clear invite-flow sessionStorage entries after successful verification. */
function clearInviteSession(isInviteFlow: boolean) {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem('verificationEmail')
  if (isInviteFlow) {
    sessionStorage.removeItem('inviteRedirectUrl')
    sessionStorage.removeItem('isInviteFlow')
  }
}

export function useVerification({
  hasEmailService,
  isProduction,
  isEmailVerificationEnabled,
}: UseVerificationParams): UseVerificationReturn {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { refetch: refetchSession } = useSession()

  const [otp, setOtp] = useState('')
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  const [isSendingInitialOtp, setIsSendingInitialOtp] = useState(false)
  const [isInvalidOtp, setIsInvalidOtp] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null)
  const [isInviteFlow, setIsInviteFlow] = useState(false)

  // Hydrate state from sessionStorage and URL params on mount.
  useEffect(() => {
    const stored = readInviteSession()
    if (stored.email) setEmail(stored.email)
    if (stored.redirectUrl) setRedirectUrl(stored.redirectUrl)
    if (stored.isInviteFlow) setIsInviteFlow(true)

    const redirectParam = searchParams.get('redirectAfter')
    if (redirectParam) setRedirectUrl(redirectParam)

    if (searchParams.get('invite_flow') === 'true') setIsInviteFlow(true)
  }, [searchParams])

  useEffect(() => {
    if (email && !isSendingInitialOtp && hasEmailService) {
      setIsSendingInitialOtp(true)
    }
  }, [email, isSendingInitialOtp, hasEmailService])

  const isOtpComplete = otp.length === 6

  async function verifyCode() {
    if (!isOtpComplete || !email) return

    setIsLoading(true)
    setIsInvalidOtp(false)
    setErrorMessage('')

    try {
      const normalizedEmail = email.trim().toLowerCase()
      const response = await client.emailOtp.verifyEmail({ email: normalizedEmail, otp })

      if (response && !response.error) {
        setIsVerified(true)

        try {
          await refetchSession()
        } catch (e) {
          logger.warn('Failed to refetch session after verification', e)
        }

        clearInviteSession(isInviteFlow)

        setTimeout(() => {
          window.location.href = isInviteFlow && redirectUrl ? redirectUrl : '/dashboard'
        }, 1000)
      } else {
        const message = 'Invalid verification code. Please check and try again.'
        setIsInvalidOtp(true)
        setErrorMessage(message)
        setOtp('')
      }
    } catch (err) {
      const message = classifyOtpError(err)
      setIsInvalidOtp(true)
      setErrorMessage(message)
      setOtp('')
    } finally {
      setIsLoading(false)
    }
  }

  function resendCode() {
    if (!email || !hasEmailService || !isEmailVerificationEnabled) return

    setIsLoading(true)
    setErrorMessage('')

    client.emailOtp
      .sendVerificationOtp({ email: email.trim().toLowerCase(), type: 'email-verification' })
      .then(() => {})
      .catch(() => {
        setErrorMessage('Failed to resend verification code. Please try again later.')
      })
      .finally(() => {
        setIsLoading(false)
      })
  }

  function handleOtpChange(value: string) {
    if (value.length === 6) {
      setIsInvalidOtp(false)
      setErrorMessage('')
    }
    setOtp(value)
  }

  // Auto-submit when all 6 digits are entered.
  useEffect(() => {
    if (otp.length !== 6 || !email || isLoading || isVerified) return
    const tid = setTimeout(() => {
      verifyCode()
    }, 300)
    return () => clearTimeout(tid)
  }, [otp, email, isLoading, isVerified])

  // Skip verification when it is disabled — redirect immediately.
  useEffect(() => {
    if (typeof window === 'undefined' || isEmailVerificationEnabled) return

    setIsVerified(true)

    const handleRedirect = async () => {
      try {
        await refetchSession()
      } catch (err) {
        logger.warn('Failed to refetch session during verification skip', err)
      }
      if (isInviteFlow && redirectUrl) {
        window.location.href = redirectUrl
      } else {
        router.push('/dashboard')
      }
    }

    handleRedirect()
  }, [isEmailVerificationEnabled, router, isInviteFlow, redirectUrl])

  return {
    otp,
    email,
    isLoading,
    isVerified,
    isInvalidOtp,
    errorMessage,
    isOtpComplete,
    hasEmailService,
    isProduction,
    isEmailVerificationEnabled,
    verifyCode,
    resendCode,
    handleOtpChange,
  }
}

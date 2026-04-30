'use client'

import { useEffect, useState } from 'react'
import { createLogger } from '@crewmeld/logger'
import { Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { client } from '@/lib/auth/auth-client'
import { cn } from '@/lib/core/utils/cn'
import { getBaseUrl } from '@/lib/core/utils/urls'
import { quickValidateEmail } from '@/lib/messaging/email/validation'
import { inter } from '@/app/_styles/fonts/inter/inter'
import { soehne } from '@/app/_styles/fonts/soehne/soehne'
import { BrandedButton } from '@/app/(auth)/components/branded-button'
import { SocialLoginButtons } from '@/app/(auth)/components/social-login-buttons'
import { useTranslation } from '@/hooks/use-translation'

const logger = createLogger('LoginForm')

/** Accept only same-origin or root-relative callback URLs. */
function isSafeCallbackUrl(url: string): boolean {
  try {
    if (url.startsWith('/')) return true
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return url.startsWith(origin)
  } catch (err) {
    logger.error('Error validating callback URL', { error: err, url })
    return false
  }
}

/** Map a better-auth error code/message to an i18n error string. */
function resolveLoginError(
  code: string | undefined,
  message: string | undefined,
  t: (k: string) => string
): string {
  if (
    code?.includes('BAD_REQUEST') ||
    message?.includes('Email and password sign in is not enabled')
  )
    return t('auth.emailPasswordDisabled')
  if (code?.includes('INVALID_CREDENTIALS') || message?.includes('invalid password'))
    return t('auth.invalidCredentialsRetry')
  if (code?.includes('USER_NOT_FOUND') || message?.includes('not found'))
    return t('auth.emailNotRegistered')
  if (code?.includes('MISSING_CREDENTIALS')) return t('auth.enterEmailAndPassword')
  if (code?.includes('EMAIL_PASSWORD_DISABLED')) return t('auth.emailPasswordDisabled')
  if (code?.includes('FAILED_TO_CREATE_SESSION')) return t('auth.sessionCreateFailed')
  if (code?.includes('too many attempts')) return t('auth.tooManyAttempts')
  if (code?.includes('account locked')) return t('auth.accountLocked')
  if (code?.includes('network')) return t('auth.networkErrorRetry')
  if (message?.includes('rate limit')) return t('auth.rateLimited')
  return t('auth.invalidCredentials')
}

export default function LoginPage({
  githubAvailable,
  googleAvailable,
  isProduction,
}: {
  githubAvailable: boolean
  googleAvailable: boolean
  isProduction: boolean
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordErrors, setPasswordErrors] = useState<string[]>([])
  const [showValidationError, setShowValidationError] = useState(false)

  const [callbackUrl, setCallbackUrl] = useState('/dashboard')
  const [isInviteFlow, setIsInviteFlow] = useState(false)

  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false)
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('')
  const [isSubmittingReset, setIsSubmittingReset] = useState(false)
  const [resetStatus, setResetStatus] = useState<{
    type: 'success' | 'error' | null
    message: string
  }>({
    type: null,
    message: '',
  })

  const [email, setEmail] = useState('')
  const [emailErrors, setEmailErrors] = useState<string[]>([])
  const [showEmailValidationError, setShowEmailValidationError] = useState(false)
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null)
  const [registrationDisabled, setRegistrationDisabled] = useState(false)

  const validateEmailField = (val: string): string[] => {
    if (!val?.trim()) return [t('auth.enterEmail')]
    const v = quickValidateEmail(val.trim().toLowerCase())
    return v.isValid ? [] : [v.reason ?? t('auth.enterValidEmail')]
  }

  const validatePassword = (val: string): string[] => {
    if (!val || typeof val !== 'string') return [t('auth.enterPassword')]
    if (!val.trim()) return [t('auth.passwordEmpty')]
    return []
  }

  useEffect(() => {
    if (!searchParams) return
    const cb = searchParams.get('callbackUrl')
    if (cb) {
      if (isSafeCallbackUrl(cb)) setCallbackUrl(cb)
      else logger.warn('Invalid callback URL blocked', { url: cb })
    }
    if (searchParams.get('invite_flow') === 'true') setIsInviteFlow(true)
    if (searchParams.get('resetSuccess') === 'true')
      setResetSuccessMessage(t('auth.passwordResetSuccess'))
  }, [searchParams, t])

  useEffect(() => {
    fetch('/api/auth/registration/settings')
      .then((r) => r.json())
      .then((d: Record<string, unknown>) =>
        setRegistrationDisabled(d.registrationDisabled === true)
      )
      .catch(() => setRegistrationDisabled(false))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && forgotPasswordOpen) handleForgotPassword()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [forgotPasswordEmail, forgotPasswordOpen])

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setEmail(v)
    setEmailErrors(validateEmailField(v))
    setShowEmailValidationError(false)
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setPassword(v)
    setPasswordErrors(validatePassword(v))
    setShowValidationError(false)
  }

  const redirectToVerify = (emailToVerify: string) => {
    if (typeof window !== 'undefined') sessionStorage.setItem('verificationEmail', emailToVerify)
    router.push('/verify')
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)

    const formData = new FormData(e.currentTarget)
    const rawEmail = formData.get('email') as string
    const normalEmail = rawEmail.trim().toLowerCase()

    const emailErrs = validateEmailField(normalEmail)
    const pwErrs = validatePassword(password)

    setEmailErrors(emailErrs)
    setShowEmailValidationError(emailErrs.length > 0)
    setPasswordErrors(pwErrs)
    setShowValidationError(pwErrs.length > 0)

    if (emailErrs.length > 0 || pwErrs.length > 0) {
      setIsLoading(false)
      return
    }

    try {
      const safeCallback = isSafeCallbackUrl(callbackUrl) ? callbackUrl : '/dashboard'
      let errorHandled = false

      const result = await client.signIn.email(
        { email: normalEmail, password, callbackURL: safeCallback },
        {
          onError: (ctx) => {
            errorHandled = true
            logger.info('Login failed', { code: ctx.error.code })

            if (ctx.error.code?.includes('EMAIL_NOT_VERIFIED')) {
              redirectToVerify(normalEmail)
              return
            }

            const pendingMsg = ctx.error.message ?? ''
            if (
              pendingMsg.includes('账号正在等待管理员审批') ||
              pendingMsg.includes('pending admin approval') ||
              pendingMsg.includes('账号申请已被拒绝') ||
              pendingMsg.includes('application was rejected') ||
              pendingMsg.includes('注册已关闭') ||
              pendingMsg.includes('Registration is closed')
            ) {
              setResetSuccessMessage(null)
              setPasswordErrors([pendingMsg])
              setShowValidationError(true)
              return
            }

            const detail = resolveLoginError(ctx.error.code, ctx.error.message, t)
            setResetSuccessMessage(null)
            setPasswordErrors([t('auth.invalidCredentials'), detail])
            setShowValidationError(true)
          },
        }
      )

      if (!result || result.error) {
        if (!errorHandled) {
          setResetSuccessMessage(null)
          setPasswordErrors([result?.error?.message ?? t('auth.loginFailed')])
          setShowValidationError(true)
        }
        setIsLoading(false)
        return
      }

      setResetSuccessMessage(null)
      router.push(safeCallback)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      const code = (err as Record<string, unknown>).code
      if (
        msg.includes('not verified') ||
        (typeof code === 'string' && code.includes('EMAIL_NOT_VERIFIED'))
      ) {
        redirectToVerify(email)
        return
      }
      logger.error('Uncaught login error', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!forgotPasswordEmail) {
      setResetStatus({ type: 'error', message: t('auth.enterEmail') })
      return
    }

    const v = quickValidateEmail(forgotPasswordEmail.trim().toLowerCase())
    if (!v.isValid) {
      setResetStatus({ type: 'error', message: t('auth.enterValidEmail') })
      return
    }

    try {
      setIsSubmittingReset(true)
      setResetStatus({ type: null, message: '' })

      const res = await fetch('/api/auth/forget-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotPasswordEmail,
          redirectTo: `${getBaseUrl()}/reset-password`,
        }),
      })

      if (!res.ok) {
        const errData = (await res.json()) as Record<string, unknown>
        let msg =
          typeof errData.message === 'string' ? errData.message : t('auth.resetRequestFailed')
        if (msg.includes('Invalid body parameters') || msg.includes('invalid email'))
          msg = t('auth.enterValidEmail')
        else if (msg.includes('Email is required')) msg = t('auth.enterEmail')
        else if (msg.toLowerCase().includes('user not found')) msg = t('auth.accountNotFound')
        throw new Error(msg)
      }

      setResetStatus({ type: 'success', message: t('auth.resetLinkSent') })
      setTimeout(() => {
        setForgotPasswordOpen(false)
        setResetStatus({ type: null, message: '' })
      }, 2000)
    } catch (err) {
      logger.error('Error requesting password reset', { error: err })
      setResetStatus({
        type: 'error',
        message: err instanceof Error ? err.message : t('auth.resetRequestFailed'),
      })
    } finally {
      setIsSubmittingReset(false)
    }
  }

  const hasSocial = githubAvailable || googleAvailable

  return (
    <>
      <div className='space-y-1 text-center'>
        <h1 className={`${soehne.className} font-medium text-[32px] text-black tracking-tight`}>
          {t('auth.welcomeBack')}
        </h1>
        <p className={`${inter.className} font-[380] text-[16px] text-muted-foreground`}>
          {t('auth.loginToAccount')}
        </p>
      </div>

      {resetSuccessMessage && (
        <div className={`${inter.className} mt-1 space-y-1 text-[#4CAF50] text-xs`}>
          <p>{resetSuccessMessage}</p>
        </div>
      )}

      <form onSubmit={onSubmit} className={`${inter.className} mt-8 space-y-8`}>
        <div className='space-y-6'>
          <div className='space-y-2'>
            <Label htmlFor='email'>{t('auth.email')}</Label>
            <Input
              id='email'
              name='email'
              placeholder={t('auth.emailPlaceholder')}
              required
              autoCapitalize='none'
              autoComplete='email'
              autoCorrect='off'
              value={email}
              onChange={handleEmailChange}
              className={cn(
                'rounded-[10px] shadow-sm transition-colors focus:border-gray-400 focus:ring-2 focus:ring-gray-100',
                showEmailValidationError &&
                  emailErrors.length > 0 &&
                  'border-red-500 focus:border-red-500 focus:ring-red-100 focus-visible:ring-red-500'
              )}
            />
            {showEmailValidationError && emailErrors.length > 0 && (
              <div className='mt-1 space-y-1 text-red-400 text-xs'>
                {emailErrors.map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            )}
          </div>

          <div className='space-y-2'>
            <div className='flex items-center justify-between'>
              <Label htmlFor='password'>{t('auth.password')}</Label>
              <button
                type='button'
                onClick={() => setForgotPasswordOpen(true)}
                className='font-medium text-muted-foreground text-xs transition hover:text-foreground'
              >
                {t('auth.forgotPassword')}
              </button>
            </div>
            <div className='relative'>
              <Input
                id='password'
                name='password'
                required
                type={showPassword ? 'text' : 'password'}
                autoCapitalize='none'
                autoComplete='current-password'
                autoCorrect='off'
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={handlePasswordChange}
                className={cn(
                  'rounded-[10px] pr-10 shadow-sm transition-colors focus:border-gray-400 focus:ring-2 focus:ring-gray-100',
                  showValidationError &&
                    passwordErrors.length > 0 &&
                    'border-red-500 focus:border-red-500 focus:ring-red-100 focus-visible:ring-red-500'
                )}
              />
              <button
                type='button'
                onClick={() => setShowPassword((v) => !v)}
                className='-translate-y-1/2 absolute top-1/2 right-3 text-gray-500 transition hover:text-gray-700'
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {showValidationError && passwordErrors.length > 0 && (
              <div className='mt-1 space-y-1 text-red-400 text-xs'>
                {passwordErrors.map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            )}
          </div>
        </div>

        <BrandedButton
          type='submit'
          disabled={isLoading}
          loading={isLoading}
          loadingText={t('auth.loggingIn')}
        >
          {t('auth.login')}
        </BrandedButton>
      </form>

      {hasSocial && (
        <>
          <div className={`${inter.className} relative my-6 font-light`}>
            <div className='absolute inset-0 flex items-center'>
              <div className='auth-divider w-full border-t' />
            </div>
            <div className='relative flex justify-center text-sm'>
              <span className='bg-white px-4 font-[340] text-muted-foreground'>
                {t('auth.orLoginWith')}
              </span>
            </div>
          </div>
          <div className={inter.className}>
            <SocialLoginButtons
              googleAvailable={googleAvailable}
              githubAvailable={githubAvailable}
              isProduction={isProduction}
              callbackURL={callbackUrl}
            />
          </div>
        </>
      )}

      {!registrationDisabled && (
        <div className={`${inter.className} pt-6 text-center font-light text-[14px]`}>
          <span className='font-normal'>{t('auth.noAccount')}</span>
          <Link
            href={isInviteFlow ? `/signup?invite_flow=true&callbackUrl=${callbackUrl}` : '/signup'}
            className='font-medium text-[var(--brand-accent-hex)] underline-offset-4 transition hover:text-[var(--brand-accent-hover-hex)] hover:underline'
          >
            {t('auth.signUp')}
          </Link>
        </div>
      )}

      <div
        className={`${inter.className} mt-8 text-center font-[340] text-[13px] text-muted-foreground leading-relaxed`}
      >
        {t('auth.termsAgreement')}{' '}
        <Link
          href='/terms'
          target='_blank'
          rel='noopener noreferrer'
          className='underline-offset-4 transition hover:text-foreground hover:underline'
        >
          {t('auth.termsOfService')}
        </Link>{' '}
        {t('common.and')}{' '}
        <Link
          href='/privacy'
          target='_blank'
          rel='noopener noreferrer'
          className='underline-offset-4 transition hover:text-foreground hover:underline'
        >
          {t('auth.privacyPolicy')}
        </Link>
      </div>

      <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
        <DialogContent className='auth-card auth-card-shadow max-w-[540px] rounded-[10px] border backdrop-blur-sm'>
          <DialogHeader>
            <DialogTitle className='font-semibold text-black text-xl tracking-tight'>
              {t('auth.resetPassword')}
            </DialogTitle>
            <DialogDescription className='text-muted-foreground text-sm'>
              {t('auth.resetPasswordDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='reset-email'>{t('auth.email')}</Label>
              <Input
                id='reset-email'
                value={forgotPasswordEmail}
                onChange={(e) => setForgotPasswordEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                required
                type='email'
                className={cn(
                  'rounded-[10px] shadow-sm transition-colors focus:border-gray-400 focus:ring-2 focus:ring-gray-100',
                  resetStatus.type === 'error' &&
                    'border-red-500 focus:border-red-500 focus:ring-red-100 focus-visible:ring-red-500'
                )}
              />
              {resetStatus.type === 'error' && (
                <div className='mt-1 space-y-1 text-red-400 text-xs'>
                  <p>{resetStatus.message}</p>
                </div>
              )}
            </div>
            {resetStatus.type === 'success' && (
              <div className='mt-1 space-y-1 text-[#4CAF50] text-xs'>
                <p>{resetStatus.message}</p>
              </div>
            )}
            <BrandedButton
              type='button'
              onClick={handleForgotPassword}
              disabled={isSubmittingReset}
              loading={isSubmittingReset}
              loadingText={t('auth.sending')}
            >
              {t('auth.sendResetLink')}
            </BrandedButton>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

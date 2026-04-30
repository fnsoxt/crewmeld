'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { GithubIcon, GoogleIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { client } from '@/lib/auth/auth-client'
import { inter } from '@/app/_styles/fonts/inter/inter'
import { useTranslation } from '@/hooks/use-translation'

interface SocialLoginButtonsProps {
  githubAvailable: boolean
  googleAvailable: boolean
  callbackURL?: string
  isProduction: boolean
  children?: ReactNode
}

/** Map of known social-error keywords to i18n keys. */
const ERROR_KEY_MAP: Array<[string, string]> = [
  ['account exists', 'auth.emailAlreadyRegistered'],
  ['cancelled', 'auth.githubLoginCancelled'],
  ['network', 'auth.networkErrorRetry'],
  ['rate limit', 'auth.rateLimited'],
]

/** Resolve an error message from a caught social-sign-in error. */
function resolveSocialError(err: unknown, fallbackKey: string, t: (k: string) => string): string {
  const msg = err instanceof Error ? err.message : ''
  for (const [fragment, key] of ERROR_KEY_MAP) {
    if (msg.includes(fragment)) return t(key)
  }
  return t(fallbackKey)
}

/**
 * Renders GitHub and/or Google OAuth sign-in buttons, plus an optional children slot.
 * Defers rendering until client mount to avoid SSR hydration mismatches.
 */
export function SocialLoginButtons({
  githubAvailable,
  googleAvailable,
  callbackURL = '/dashboard',
  isProduction: _isProduction,
  children,
}: SocialLoginButtonsProps) {
  const { t } = useTranslation()
  const [isGithubLoading, setIsGithubLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])
  if (!mounted) return null

  const hasAnyProvider = githubAvailable || googleAvailable
  if (!hasAnyProvider && !children) return null

  async function signInWithGithub() {
    if (!githubAvailable) return
    setIsGithubLoading(true)
    try {
      await client.signIn.social({ provider: 'github', callbackURL })
    } catch (err) {
      resolveSocialError(err, 'auth.githubLoginFailed', t)
    } finally {
      setIsGithubLoading(false)
    }
  }

  async function signInWithGoogle() {
    if (!googleAvailable) return
    setIsGoogleLoading(true)
    try {
      await client.signIn.social({ provider: 'google', callbackURL })
    } catch (err) {
      resolveSocialError(err, 'auth.googleLoginFailed', t)
    } finally {
      setIsGoogleLoading(false)
    }
  }

  return (
    <div className={`${inter.className} grid gap-3 font-light`}>
      {googleAvailable && (
        <Button
          variant='outline'
          className='w-full rounded-[10px] shadow-sm hover:bg-gray-50'
          disabled={!googleAvailable || isGoogleLoading}
          onClick={signInWithGoogle}
        >
          <GoogleIcon className='!h-[18px] !w-[18px] mr-1' />
          {isGoogleLoading ? t('auth.connecting') : 'Google'}
        </Button>
      )}
      {githubAvailable && (
        <Button
          variant='outline'
          className='w-full rounded-[10px] shadow-sm hover:bg-gray-50'
          disabled={!githubAvailable || isGithubLoading}
          onClick={signInWithGithub}
        >
          <GithubIcon className='!h-[18px] !w-[18px] mr-1' />
          {isGithubLoading ? t('auth.connecting') : 'GitHub'}
        </Button>
      )}
      {children}
    </div>
  )
}

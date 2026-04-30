'use client'

import type { ReactNode } from 'react'
import Nav from '@/components/nav/nav'
import { inter } from '@/app/_styles/fonts/inter/inter'
import { soehne } from '@/app/_styles/fonts/soehne/soehne'
import AuthBackground from '@/app/(auth)/components/auth-background'
import { SupportFooter } from './support-footer'

export interface StatusPageLayoutProps {
  /** Prominently displayed page title. */
  title: string
  /** Descriptive text rendered below the title. */
  description: string | ReactNode
  /** Optional slot for action buttons or other content. */
  children?: ReactNode
  /** When false, hides the support footer (default: true). */
  showSupportFooter?: boolean
  /** When true, hides the top nav bar. */
  hideNav?: boolean
}

/**
 * Shared layout for status and error pages (404, unavailable, etc.).
 * Wraps content in AuthBackground with an optional Nav and SupportFooter.
 *
 * @example
 * ```tsx
 * <StatusPageLayout title="Not Found" description="This page does not exist.">
 *   <BrandedButton onClick={() => router.push('/')}>Go Home</BrandedButton>
 * </StatusPageLayout>
 * ```
 */
export function StatusPageLayout({
  title,
  description,
  children,
  showSupportFooter = true,
  hideNav = false,
}: StatusPageLayoutProps) {
  return (
    <AuthBackground>
      <main className='relative flex min-h-screen flex-col text-foreground'>
        {!hideNav && <Nav hideAuthButtons variant='auth' />}

        <div className='relative z-30 flex flex-1 items-center justify-center px-4 pb-24'>
          <div className='w-full max-w-lg px-4'>
            <div className='flex flex-col items-center justify-center'>
              <div className='space-y-1 text-center'>
                <h1
                  className={`${soehne.className} font-medium text-[32px] text-black tracking-tight`}
                >
                  {title}
                </h1>
                <p className={`${inter.className} font-[380] text-[16px] text-muted-foreground`}>
                  {description}
                </p>
              </div>

              {children != null && (
                <div className={`${inter.className} mt-8 w-full max-w-[410px] space-y-3`}>
                  {children}
                </div>
              )}
            </div>
          </div>
        </div>

        {showSupportFooter && <SupportFooter position='absolute' />}
      </main>
    </AuthBackground>
  )
}

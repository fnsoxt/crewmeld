'use client'

import { useBrandConfig } from '@/lib/core/branding'
import { inter } from '@/app/_styles/fonts/inter/inter'
import { useTranslation } from '@/hooks/use-translation'

export interface SupportFooterProps {
  /** Controls CSS position — 'fixed' for standalone pages, 'absolute' inside AuthLayout. */
  position?: 'fixed' | 'absolute'
}

/**
 * Footer shown on auth and status pages with a branded support-email link.
 *
 * @example
 * ```tsx
 * <SupportFooter position="absolute" />
 * ```
 */
export function SupportFooter({ position = 'fixed' }: SupportFooterProps) {
  const { t } = useTranslation()
  const { supportEmail } = useBrandConfig()

  const positionClass = position === 'absolute' ? 'absolute' : 'fixed'

  return (
    <div
      className={`${inter.className} auth-text-muted ${positionClass} right-0 bottom-0 left-0 z-50 pb-8 text-center font-[340] text-[13px] leading-relaxed`}
    >
      {t('auth.needHelp')}{' '}
      <a
        href={`mailto:${supportEmail}`}
        className='auth-link underline-offset-4 transition hover:underline'
      >
        {t('auth.contactSupport')}
      </a>
    </div>
  )
}

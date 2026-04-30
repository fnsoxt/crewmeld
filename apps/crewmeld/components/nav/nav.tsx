'use client'

import { useCallback, useState } from 'react'
import { ArrowRight, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useBrandConfig } from '@/lib/core/branding'
import { isHosted } from '@/lib/core/config/feature-flags'
import { useBrandedButtonClass } from '@/hooks/use-branded-button-class'

interface NavProps {
  hideAuthButtons?: boolean
  variant?: 'landing' | 'auth' | 'legal'
}

export default function Nav({ hideAuthButtons = false, variant = 'landing' }: NavProps = {}) {
  const [isHovered, setIsHovered] = useState(false)
  const [isLoginHovered, setIsLoginHovered] = useState(false)
  const router = useRouter()
  const brand = useBrandConfig()
  const buttonClass = useBrandedButtonClass()

  const handleLoginClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      router.push('/login')
    },
    [router]
  )

  return (
    <nav
      aria-label='Primary navigation'
      className={`flex w-full items-center justify-between px-4 ${
        variant === 'auth' ? 'pt-[20px] sm:pt-[16.5px]' : 'pt-[12px] sm:pt-[8.5px]'
      } pb-[21px] sm:px-8 md:px-[44px]`}
      itemScope
      itemType='https://schema.org/SiteNavigationElement'
    >
      <div className='flex items-center gap-[34px]'>
        <Link href='/' aria-label={`${brand.name} home`} itemProp='url'>
          <span itemProp='name' className='sr-only'>
            {brand.name} Home
          </span>
          {brand.logoUrl ? (
            <Image
              src={brand.logoUrl}
              alt={`${brand.name} Logo`}
              width={49.78314}
              height={24.276}
              className='h-[24.276px] w-auto object-contain'
              priority
              loading='eager'
              quality={100}
              unoptimized
            />
          ) : (
            <Image
              src='/logo/b&w/text/b&w.svg'
              alt='CrewMeld'
              width={100}
              height={24.276}
              className='h-[24.276px] w-auto'
              priority
              loading='eager'
              quality={100}
            />
          )}
        </Link>
      </div>

      {/* Auth Buttons - show only when hosted, regardless of variant */}
      {!hideAuthButtons && isHosted && (
        <div className='flex items-center justify-center gap-[16px] pt-[1.5px]'>
          <button
            onClick={handleLoginClick}
            onMouseEnter={() => setIsLoginHovered(true)}
            onMouseLeave={() => setIsLoginHovered(false)}
            className='group hidden text-[#2E2E2E] text-[16px] transition-colors hover:text-foreground md:block'
            type='button'
            aria-label='Log in to your account'
          >
            <span className='flex items-center gap-1'>
              Log in
              <span className='inline-flex transition-transform duration-200 group-hover:translate-x-0.5'>
                {isLoginHovered ? (
                  <ArrowRight className='h-4 w-4' aria-hidden='true' />
                ) : (
                  <ChevronRight className='h-4 w-4' aria-hidden='true' />
                )}
              </span>
            </span>
          </button>
          <Link
            href='/signup'
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`${buttonClass} group inline-flex items-center justify-center gap-2 rounded-[10px] py-[6px] pr-[10px] pl-[12px] text-[15px] text-white transition-all`}
            aria-label='Get started - Sign up for free'
            prefetch={true}
          >
            <span className='flex items-center gap-1'>
              Get started
              <span className='inline-flex transition-transform duration-200 group-hover:translate-x-0.5'>
                {isHovered ? (
                  <ArrowRight className='h-4 w-4' aria-hidden='true' />
                ) : (
                  <ChevronRight className='h-4 w-4' aria-hidden='true' />
                )}
              </span>
            </span>
          </Link>
        </div>
      )}
    </nav>
  )
}

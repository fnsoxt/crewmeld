'use client'

import { forwardRef, useState } from 'react'
import { ArrowRight, ChevronRight, Loader2 } from 'lucide-react'
import { Button, type ButtonProps as EmcnButtonProps } from '@/components/emcn'
import { cn } from '@/lib/core/utils/cn'
import { useBrandedButtonClass } from '@/hooks/use-branded-button-class'

export interface BrandedButtonProps extends Omit<EmcnButtonProps, 'variant' | 'size'> {
  /** Renders a spinner and disables interaction while true. */
  loading?: boolean
  /** Label shown during loading — "..." is appended automatically. */
  loadingText?: string
  /** Animate a right-arrow icon on hover (default: true). */
  showArrow?: boolean
  /** Stretch button to container width (default: true). */
  fullWidth?: boolean
}

/** Arrow icon that switches between chevron (idle) and full arrow (hover). */
function HoverArrow({ hovered }: { hovered: boolean }) {
  return (
    <span className='inline-flex transition-transform duration-200 group-hover:translate-x-0.5'>
      {hovered ? (
        <ArrowRight className='h-4 w-4' aria-hidden='true' />
      ) : (
        <ChevronRight className='h-4 w-4' aria-hidden='true' />
      )}
    </span>
  )
}

/**
 * Primary branded button for auth and status pages.
 * Detects whitelabel configuration via `useBrandedButtonClass`.
 *
 * @example
 * ```tsx
 * <BrandedButton onClick={handleSubmit}>Sign In</BrandedButton>
 * <BrandedButton loading loadingText="Signing in">Sign In</BrandedButton>
 * <BrandedButton showArrow={false}>Continue</BrandedButton>
 * ```
 */
export const BrandedButton = forwardRef<HTMLButtonElement, BrandedButtonProps>(
  (
    {
      children,
      loading = false,
      loadingText,
      showArrow = true,
      fullWidth = true,
      className,
      disabled,
      onMouseEnter,
      onMouseLeave,
      ...rest
    },
    ref
  ) => {
    const buttonClass = useBrandedButtonClass()
    const [hovered, setHovered] = useState(false)

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      setHovered(true)
      onMouseEnter?.(e)
    }

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      setHovered(false)
      onMouseLeave?.(e)
    }

    let content: React.ReactNode
    if (loading) {
      content = (
        <span className='flex items-center gap-2'>
          <Loader2 className='h-4 w-4 animate-spin' />
          {loadingText ? `${loadingText}...` : children}
        </span>
      )
    } else if (showArrow) {
      content = (
        <span className='flex items-center gap-1'>
          {children}
          <HoverArrow hovered={hovered} />
        </span>
      )
    } else {
      content = children
    }

    return (
      <Button
        ref={ref}
        variant='branded'
        size='branded'
        disabled={disabled || loading}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(buttonClass, 'group', fullWidth && 'w-full', className)}
        {...rest}
      >
        {content}
      </Button>
    )
  }
)

BrandedButton.displayName = 'BrandedButton'

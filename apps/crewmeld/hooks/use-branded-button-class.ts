'use client'

import { useEffect, useState } from 'react'

const DEFAULT_BRAND_ACCENT = '#6f3dfa'

export type BrandedButtonClass = 'branded-button-gradient' | 'branded-button-custom'

/**
 */
export function useBrandedButtonClass(): BrandedButtonClass {
  const [buttonClass, setButtonClass] = useState<BrandedButtonClass>('branded-button-gradient')

  useEffect(() => {
    const checkCustomBrand = () => {
      const computedStyle = getComputedStyle(document.documentElement)
      const brandAccent = computedStyle.getPropertyValue('--brand-accent-hex').trim()

      if (brandAccent && brandAccent !== DEFAULT_BRAND_ACCENT) {
        setButtonClass('branded-button-custom')
      } else {
        setButtonClass('branded-button-gradient')
      }
    }

    checkCustomBrand()

    window.addEventListener('resize', checkCustomBrand)
    const observer = new MutationObserver(checkCustomBrand)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    })

    return () => {
      window.removeEventListener('resize', checkCustomBrand)
      observer.disconnect()
    }
  }, [])

  return buttonClass
}

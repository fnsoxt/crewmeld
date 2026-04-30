'use client'

import { Globe, Settings, Shield, Zap } from 'lucide-react'
import Image from 'next/image'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBrandConfig } from '@/lib/core/branding'
import type { TranslationKey } from '@/hooks/use-translation'
import { useTranslation } from '@/hooks/use-translation'
import { useLocaleStore } from '@/stores/locale/store'

interface FeatureConfig {
  icon: typeof Shield
  titleKey: TranslationKey
  descKey: TranslationKey
}

const featureConfigs: FeatureConfig[] = [
  {
    icon: Shield,
    titleKey: 'auth.featureSecurityTitle',
    descKey: 'auth.featureSecurityDesc',
  },
  {
    icon: Zap,
    titleKey: 'auth.featureAutomationTitle',
    descKey: 'auth.featureAutomationDesc',
  },
  {
    icon: Settings,
    titleKey: 'auth.featureOrchestrationTitle',
    descKey: 'auth.featureOrchestrationDesc',
  },
]

export function AuthBrandPanel() {
  const brand = useBrandConfig()
  const { t, locale } = useTranslation()
  const { setLocale } = useLocaleStore()

  return (
    <>
      {/* Desktop: left panel */}
      <div className='relative hidden bg-gradient-to-b from-[#2563EB] to-[#1D4ED8] p-12 text-white lg:flex lg:w-[40%] lg:flex-col lg:items-center lg:justify-center'>
        {/* Language switcher — top-right corner */}
        <div className='absolute top-4 right-4'>
          <Select value={locale} onValueChange={(v) => setLocale(v as 'zh-CN' | 'en')}>
            <SelectTrigger className='h-8 w-28 border-white/20 bg-white/10 text-white text-xs backdrop-blur-sm hover:bg-white/20 focus:ring-white/30 [&>svg]:text-white/60'>
              <Globe className='mr-1 h-3 w-3' />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='zh-CN'>简体中文</SelectItem>
              <SelectItem value='en'>English</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className='flex max-w-sm flex-col items-center gap-10'>
          {brand.logoUrl ? (
            <Image
              src={brand.logoUrl}
              alt={`${brand.name} Logo`}
              width={160}
              height={40}
              className='h-10 w-auto object-contain brightness-0 invert'
              priority
            />
          ) : (
            <Image
              src='/logo/crewmeld-text-white.svg'
              alt='CrewMeld'
              width={160}
              height={40}
              className='h-10 w-auto'
              priority
            />
          )}
          <p className='text-center font-medium text-lg text-white/90'>
            {t('auth.platformSlogan')}
          </p>
          <div className='flex w-full flex-col gap-6'>
            {featureConfigs.map((feature) => (
              <div key={feature.titleKey} className='flex items-start gap-4'>
                <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10'>
                  <feature.icon className='h-5 w-5 text-white' />
                </div>
                <div>
                  <p className='font-medium text-white'>{t(feature.titleKey)}</p>
                  <p className='text-sm text-white/70'>{t(feature.descKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile: top bar */}
      <div className='flex items-center justify-between bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] px-6 py-4 lg:hidden'>
        <div className='flex items-center gap-3'>
          {brand.logoUrl ? (
            <Image
              src={brand.logoUrl}
              alt={`${brand.name} Logo`}
              width={100}
              height={24}
              className='h-6 w-auto object-contain brightness-0 invert'
              priority
            />
          ) : (
            <Image
              src='/logo/crewmeld-text-white.svg'
              alt='CrewMeld'
              width={100}
              height={24}
              className='h-6 w-auto'
              priority
            />
          )}
          <span className='text-sm text-white/80'>{t('auth.platformSlogan')}</span>
        </div>
        {/* Mobile language switcher */}
        <Select value={locale} onValueChange={(v) => setLocale(v as 'zh-CN' | 'en')}>
          <SelectTrigger className='h-7 w-24 border-white/20 bg-white/10 text-white text-xs backdrop-blur-sm hover:bg-white/20 focus:ring-white/30 [&>svg]:text-white/60'>
            <Globe className='mr-1 h-3 w-3' />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='zh-CN'>简体中文</SelectItem>
            <SelectItem value='en'>English</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  )
}

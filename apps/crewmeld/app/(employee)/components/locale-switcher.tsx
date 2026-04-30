'use client'

import { Globe } from 'lucide-react'
import { cn } from '@/lib/core/utils/cn'
import { useTranslation } from '@/hooks/use-translation'
import { useLocaleStore } from '@/stores/locale/store'

export function LocaleSwitcher() {
  const { setLocale } = useLocaleStore()
  const { locale } = useTranslation()

  return (
    <div className='flex w-full items-center gap-1 rounded-lg bg-gray-100 p-0.5'>
      <button
        type='button'
        onClick={() => setLocale('zh-CN')}
        className={cn(
          'flex flex-1 items-center justify-center gap-1 rounded-md py-1 font-medium text-xs transition-colors',
          locale === 'zh-CN'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        )}
      >
        <Globe className='h-3 w-3' />
        中文
      </button>
      <button
        type='button'
        onClick={() => setLocale('en')}
        className={cn(
          'flex flex-1 items-center justify-center gap-1 rounded-md py-1 font-medium text-xs transition-colors',
          locale === 'en' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
        )}
      >
        EN
      </button>
    </div>
  )
}

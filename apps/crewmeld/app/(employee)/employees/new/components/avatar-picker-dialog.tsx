'use client'

import { useState } from 'react'
import { cn } from '@/lib/core/utils/cn'
import { useTranslation } from '@/hooks/use-translation'
import { AVATAR_CATEGORIES } from '../types'

interface AvatarPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string
  onSelect: (emoji: string) => void
}

export function AvatarPickerDialog({
  open,
  onOpenChange,
  value,
  onSelect,
}: AvatarPickerDialogProps) {
  const { t } = useTranslation()
  const [activeCategory, setActiveCategory] = useState(0)
  const [selected, setSelected] = useState(value)

  function handleClose() {
    onOpenChange(false)
  }

  function handleConfirm() {
    onSelect(selected)
    onOpenChange(false)
  }

  if (!open) return null

  const category = AVATAR_CATEGORIES[activeCategory]

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
      <div className='w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-xl'>
        {/* Header */}
        <div className='flex items-center justify-between border-gray-200 border-b px-6 py-4'>
          <h2 className='font-semibold text-gray-900 text-lg'>
            {t('employees.avatarPickerTitle')}
          </h2>
          <button
            onClick={handleClose}
            className='rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          >
            <svg className='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M6 18L18 6M6 6l12 12'
              />
            </svg>
          </button>
        </div>

        {/* Category tabs */}
        <div className='flex gap-1 overflow-x-auto border-gray-200 border-b px-6'>
          {AVATAR_CATEGORIES.map((cat, idx) => (
            <button
              key={cat.label}
              data-testid={`dialog:avatar-picker:category:${cat.label}`}
              onClick={() => setActiveCategory(idx)}
              className={cn(
                'shrink-0 px-3 py-2.5 font-medium text-sm transition-colors',
                idx === activeCategory
                  ? 'border-blue-600 border-b-2 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        {/* Emoji grid */}
        <div className='px-6 py-4'>
          <div className='grid grid-cols-8 gap-2'>
            {category.emojis.map((emoji) => (
              <button
                key={emoji}
                data-testid={`dialog:avatar-picker:emoji:${emoji}`}
                onClick={() => setSelected(emoji)}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-xl border-2 text-2xl transition-colors',
                  selected === emoji
                    ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200'
                    : 'border-gray-200 hover:border-gray-300'
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className='flex items-center justify-between border-gray-200 border-t px-6 py-4'>
          <div className='flex items-center gap-2'>
            <span className='text-3xl'>{selected}</span>
            <span className='text-gray-500 text-sm'>{t('employees.avatarPickerCurrent')}</span>
          </div>
          <div className='flex gap-3'>
            <button
              onClick={handleClose}
              className='rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 text-sm hover:bg-gray-50'
            >
              {t('common.cancel')}
            </button>
            <button
              data-testid='dialog:avatar-picker:confirm'
              onClick={handleConfirm}
              className='rounded-lg bg-blue-600 px-4 py-2 font-medium text-sm text-white hover:bg-blue-700'
            >
              {t('common.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

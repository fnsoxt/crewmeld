'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/core/utils/cn'
import type { ToastItem } from '@/hooks/use-toast'

interface ToastPortalProps {
  toasts: ToastItem[]
}

export function ToastPortal({ toasts }: ToastPortalProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  if (!mounted) return null

  return createPortal(
    <div className='-translate-x-1/2 pointer-events-none fixed top-6 left-1/2 z-50 flex flex-col items-center gap-2'>
      {toasts.map((t) => (
        <div
          key={t.id}
          data-testid={`toast:${t.variant}`}
          className={cn(
            'fade-in slide-in-from-top-2 flex animate-in items-center gap-2 rounded-lg px-4 py-2.5 font-medium text-sm text-white shadow-lg duration-200',
            t.variant === 'success' ? 'bg-green-500' : 'bg-red-500'
          )}
        >
          {t.variant === 'success' ? (
            <svg className='h-4 w-4 shrink-0' viewBox='0 0 20 20' fill='currentColor'>
              <path
                fillRule='evenodd'
                d='M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z'
                clipRule='evenodd'
              />
            </svg>
          ) : (
            <svg className='h-4 w-4 shrink-0' viewBox='0 0 20 20' fill='currentColor'>
              <path
                fillRule='evenodd'
                d='M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z'
                clipRule='evenodd'
              />
            </svg>
          )}
          {t.message}
        </div>
      ))}
    </div>,
    document.body
  )
}

'use client'

import Link from 'next/link'
import { useTranslation } from '@/hooks/use-translation'

export default function PendingApprovalPage() {
  const { t } = useTranslation()
  return (
    <div className='flex min-h-screen items-center justify-center bg-gray-50'>
      <div className='mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm'>
        <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50'>
          <svg
            className='h-8 w-8 text-amber-500'
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
            strokeWidth={1.5}
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              d='M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z'
            />
          </svg>
        </div>
        <h1 className='mb-2 font-semibold text-gray-900 text-xl'>
          {t('auth.pendingApprovalTitle')}
        </h1>
        <p className='mb-6 text-gray-500 text-sm'>{t('auth.pendingApprovalDescription')}</p>
        <Link
          href='/login'
          className='inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-gray-800'
        >
          {t('auth.backToLogin')}
        </Link>
      </div>
    </div>
  )
}

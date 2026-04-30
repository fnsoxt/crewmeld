'use client'

import { MessageSquare } from 'lucide-react'
import { EmployeeSelector } from '@/components/conversation/employee-selector'
import { useTranslation } from '@/hooks/use-translation'

export default function ChatPage() {
  const { t } = useTranslation()
  return (
    <div className='space-y-6'>
      <div>
        <div className='flex items-center gap-2'>
          <MessageSquare className='h-5 w-5 text-gray-700' />
          <h1 className='font-semibold text-gray-900 text-xl'>{t('conversations.title')}</h1>
        </div>
        <p className='mt-1 text-gray-500 text-sm'>{t('conversations.subtitle')}</p>
      </div>
      <EmployeeSelector />
    </div>
  )
}

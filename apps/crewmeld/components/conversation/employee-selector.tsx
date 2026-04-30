'use client'

import { useEffect, useState } from 'react'
import { History, MessageSquare, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/core/utils/cn'
import { useTranslation } from '@/hooks/use-translation'

interface EmployeeItem {
  id: string
  name: string
  avatar: string | null
  description: string | null
  status: string
  modelDisplayName: string | null
}

export function EmployeeSelector() {
  const { t } = useTranslation()
  const router = useRouter()
  const [employees, setEmployees] = useState<EmployeeItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetch('/api/employee/employees?limit=50')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setEmployees(json.data)
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className='h-32 animate-pulse rounded-xl bg-gray-200' />
        ))}
      </div>
    )
  }

  if (employees.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center py-12 text-gray-500'>
        <Users className='mb-3 h-12 w-12 text-gray-300' />
        <p className='text-sm'>{t('conversation.noEmployeesTitle')}</p>
        <p className='mt-1 text-gray-400 text-xs'>{t('conversation.noEmployeesHint')}</p>
      </div>
    )
  }

  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
      {employees.map((emp) => (
        <div
          key={emp.id}
          data-testid={`chat:employee-card:${emp.id}`}
          className={cn(
            'flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-blue-300 hover:bg-blue-50',
            emp.status !== 'active' && 'opacity-60'
          )}
        >
          <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-2xl'>
            {emp.avatar ?? emp.name.slice(0, 1)}
          </div>
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-2'>
              <h3 className='truncate font-medium text-gray-900 text-sm'>{emp.name}</h3>
              <span
                className={cn(
                  'inline-flex h-1.5 w-1.5 rounded-full',
                  emp.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
                )}
              />
            </div>
            <p className='mt-1 line-clamp-2 text-gray-500 text-xs'>
              {emp.description ?? t('conversation.noDescriptionLabel')}
            </p>
            {emp.modelDisplayName && (
              <p className='mt-1 text-purple-500 text-xs'>{emp.modelDisplayName}</p>
            )}
          </div>
          <div className='flex shrink-0 flex-col gap-1'>
            <button
              data-testid={`chat:employee-card:chat:${emp.id}`}
              title={t('conversation.chatTitle')}
              onClick={() => router.push(`/conversations/${emp.id}`)}
              className='rounded-md p-1.5 text-gray-400 transition-colors hover:bg-blue-100 hover:text-blue-600'
            >
              <MessageSquare className='h-4 w-4' />
            </button>
            <button
              data-testid={`chat:employee-card:history:${emp.id}`}
              title={t('conversation.historyRecordsTitle')}
              onClick={() => router.push(`/conversations/${emp.id}/history`)}
              className='rounded-md p-1.5 text-gray-400 transition-colors hover:bg-blue-100 hover:text-blue-600'
            >
              <History className='h-4 w-4' />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

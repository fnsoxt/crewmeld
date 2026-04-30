'use client'

import { useState } from 'react'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/hooks/use-translation'

interface EmployeeHeaderProps {
  employee: {
    id: string
    name: string
    avatar: string | null
    description: string | null
    status: string
    activatedAt: string | null
    createdAt: string
  }
  onDelete: () => Promise<void>
}

function getDaysActive(activatedAt: string | null): number {
  if (!activatedAt) return 0
  const diff = Date.now() - new Date(activatedAt).getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

export function EmployeeHeader({ employee, onDelete }: EmployeeHeaderProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const [isUpdating, setIsUpdating] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const daysActive = getDaysActive(employee.activatedAt)

  const handleDelete = async () => {
    if (isUpdating) return
    setIsUpdating(true)
    setDeleteError(null)
    try {
      await onDelete()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t('employees.deleteFailed'))
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className='border-gray-200 border-b bg-white px-6 py-5'>
      <div className='flex items-center gap-4'>
        <Button
          variant='ghost'
          size='icon'
          onClick={() => router.push('/employees')}
          className='shrink-0'
        >
          <ArrowLeft className='h-5 w-5' />
        </Button>

        <div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-600 text-lg'>
          {employee.avatar ?? employee.name.charAt(0)}
        </div>

        <div className='min-w-0 flex-1'>
          <h1 className='truncate font-semibold text-gray-900 text-xl'>{employee.name}</h1>
          {employee.activatedAt && (
            <div className='mt-1 text-gray-500 text-sm'>
              <span>{t('employees.onDuty', { days: daysActive })}</span>
            </div>
          )}
          {employee.description && (
            <p className='mt-0.5 line-clamp-2 text-gray-500 text-sm'>{employee.description}</p>
          )}
        </div>

        <div className='flex shrink-0 items-center gap-2'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => {
              setDeleteError(null)
              setShowDeleteDialog(true)
            }}
            disabled={isUpdating}
            className='text-red-500 hover:bg-red-50 hover:text-red-700'
          >
            <Trash2 className='h-4 w-4' />
          </Button>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('employees.headerDeleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('employees.deleteDetailWarning', { name: employee.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className='px-1 text-red-600 text-sm'>{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>
              {t('employees.headerCancel')}
            </AlertDialogCancel>
            {!deleteError && (
              <Button
                onClick={handleDelete}
                className='bg-red-600 hover:bg-red-700'
                disabled={isUpdating}
              >
                {t('employees.headerDeleteBtn')}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

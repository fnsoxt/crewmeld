'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Search, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ToastPortal } from '@/components/ui/toast-portal'
import { cn } from '@/lib/core/utils/cn'
import { useToast } from '@/hooks/use-toast'
import { useTranslation } from '@/hooks/use-translation'
import { PermissionGuard } from '../components/permission-guard'

interface EmployeeListItem {
  id: string
  name: string
  avatar: string | null
  description: string | null
  blockType: string
  workflowId: string | null
  config: Record<string, unknown>
  todayTasks: number
  successRate: number
  blockCount: number
  modelDisplayName: string | null
  workflowBindingCount: number
  knowledgeBindingCount: number
  createdAt: string
  updatedAt: string
}

interface EmployeeCardProps {
  employee: EmployeeListItem
  onRefresh: () => void
  onDeleted: (name: string) => void
}

function EmployeeCard({ employee, onRefresh, onDeleted }: EmployeeCardProps) {
  const { t, tMessage } = useTranslation()
  const [isUpdating, setIsUpdating] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = useCallback(async () => {
    setIsUpdating(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/employee/employees/${employee.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json()
        setDeleteError(tMessage(err) || t('employees.deleteFailed'))
        return
      }
      setDeleteDialogOpen(false)
      onDeleted(employee.name)
      onRefresh()
    } finally {
      setIsUpdating(false)
    }
  }, [employee.id, employee.name, onRefresh, onDeleted, t, tMessage])

  return (
    <>
      <Card
        data-testid={`employee-list:card:${employee.id}`}
        className={cn('transition-shadow hover:shadow-md', isUpdating && 'opacity-60')}
      >
        <CardHeader className='flex flex-row items-center justify-between pb-3'>
          <Link
            href={`/employees/${employee.id}`}
            className='font-semibold text-base text-gray-900 hover:text-blue-600'
          >
            {employee.name}
          </Link>
          <PermissionGuard requires='employee:delete'>
            <Button
              variant='ghost'
              size='icon'
              className='h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600'
              disabled={isUpdating}
              onClick={() => {
                setDeleteError(null)
                setDeleteDialogOpen(true)
              }}
            >
              <Trash2 className='h-4 w-4' />
            </Button>
          </PermissionGuard>
        </CardHeader>
        <CardContent>
          <p className='mb-4 min-h-[2.75rem] text-muted-foreground text-sm leading-relaxed'>
            {employee.description}
          </p>
          <div className='flex gap-6'>
            <div>
              <div className='text-muted-foreground text-xs'>{t('employees.todayTasks')}</div>
              <div className='font-semibold text-gray-900 text-xl'>{employee.todayTasks}</div>
            </div>
            <div>
              <div className='text-muted-foreground text-xs'>{t('dashboard.successRate')}</div>
              <div className='font-semibold text-gray-900 text-xl'>
                {employee.successRate > 0 ? `${employee.successRate.toFixed(1)}%` : '-'}
              </div>
            </div>
          </div>
          {(employee.blockCount > 0 ||
            employee.workflowBindingCount > 0 ||
            employee.knowledgeBindingCount > 0 ||
            employee.modelDisplayName) && (
            <div className='mt-3 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs'>
              {employee.modelDisplayName && (
                <span>
                  {t('employees.modelPrefix')} {employee.modelDisplayName}
                </span>
              )}
              {employee.blockCount > 0 && (
                <span>
                  {t('employees.equippedWith')} {employee.blockCount}{' '}
                  {t('employees.operatorsSuffix')}
                </span>
              )}
              {employee.workflowBindingCount > 0 && (
                <span>
                  {t('employees.boundWith')} {employee.workflowBindingCount}{' '}
                  {t('employees.workflowsSuffix')}
                </span>
              )}
              {employee.knowledgeBindingCount > 0 && (
                <span>
                  {t('employees.associatedWith')} {employee.knowledgeBindingCount}{' '}
                  {t('employees.knowledgeBasesSuffix')}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('employees.deleteWarning', { name: employee.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className='px-1 text-red-600 text-sm'>{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>{t('common.cancel')}</AlertDialogCancel>
            {!deleteError && (
              <Button
                onClick={handleDelete}
                className='bg-red-600 hover:bg-red-700 focus:ring-red-600'
                disabled={isUpdating}
              >
                {t('common.delete')}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function LoadingSkeleton() {
  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className='h-48 animate-pulse rounded-xl bg-gray-200' />
      ))}
    </div>
  )
}

interface EmptyStateProps {
  hasFilters: boolean
}

function EmptyState({ hasFilters }: EmptyStateProps) {
  const { t } = useTranslation()
  return (
    <div className='flex min-h-[60vh] flex-col items-center justify-center'>
      <div className='text-center'>
        <div className='mb-4 text-6xl'>&#x1F465;</div>
        <h3 className='mb-2 font-semibold text-gray-900 text-xl'>
          {hasFilters ? t('employees.noMatch') : t('employees.empty')}
        </h3>
        <p className='mb-6 text-gray-500 text-sm'>
          {hasFilters ? t('employees.adjustFilters') : t('employees.onboardFirst')}
        </p>
        {!hasFilters && (
          <PermissionGuard requires='employee:create'>
            <Button asChild>
              <Link href='/employees/new'>
                <Plus className='h-4 w-4' />
                {t('employees.onboardNew')}
              </Link>
            </Button>
          </PermissionGuard>
        )}
      </div>
    </div>
  )
}

export default function EmployeesPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toasts, showToast } = useToast()
  const [employees, setEmployees] = useState<EmployeeListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Handle cross-page delete toast (set by detail page before navigating back).
  // Dedupe by query fingerprint so React strict-mode double invoke and any
  // async router.replace lag don't surface two toasts.
  const handledDeleteRef = useRef<string | null>(null)
  useEffect(() => {
    if (!searchParams) return
    if (searchParams.get('deleted') !== '1') return
    const fingerprint = searchParams.toString()
    if (handledDeleteRef.current === fingerprint) return
    handledDeleteRef.current = fingerprint
    const name = searchParams.get('name') ?? ''
    showToast(t('employees.deleteSuccess', { name }))
    router.replace('/employees')
  }, [searchParams, showToast, t, router])

  const handleEmployeeDeleted = useCallback(
    (name: string) => {
      showToast(t('employees.deleteSuccess', { name }))
    },
    [showToast, t]
  )

  const fetchEmployees = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (searchQuery.trim()) params.append('search', searchQuery.trim())

      const res = await fetch(`/api/employee/employees?${params}`)
      if (!res.ok) {
        throw new Error(t('employees.fetchFailed'))
      }
      const json = await res.json()
      setEmployees(json.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.unknownError'))
    } finally {
      setIsLoading(false)
    }
  }, [searchQuery])

  useEffect(() => {
    const timer = setTimeout(fetchEmployees, searchQuery ? 300 : 0)
    return () => clearTimeout(timer)
  }, [fetchEmployees, searchQuery])

  const hasFilters = searchQuery.trim() !== ''

  return (
    <div>
      <div className='mb-6 flex items-center justify-between'>
        <h1 className='font-bold text-2xl text-gray-900'>{t('employees.title')}</h1>
        <PermissionGuard requires='employee:create'>
          <Button asChild>
            <Link href='/employees/new'>
              <Plus className='h-4 w-4' />
              {t('employees.onboardNew')}
            </Link>
          </Button>
        </PermissionGuard>
      </div>

      <div className='mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4'>
        <div className='relative flex-1'>
          <Search className='-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground' />
          <Input
            type='text'
            placeholder={t('employees.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className='pl-9'
          />
        </div>
      </div>

      {error && (
        <div className='mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm'>
          <p>{error}</p>
          <button
            onClick={fetchEmployees}
            className='mt-2 font-medium text-red-800 underline hover:no-underline'
          >
            {t('dashboard.reload')}
          </button>
        </div>
      )}

      {isLoading ? (
        <LoadingSkeleton />
      ) : employees.length === 0 && !error ? (
        <EmptyState hasFilters={hasFilters} />
      ) : (
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {employees.map((employee) => (
            <EmployeeCard
              key={employee.id}
              employee={employee}
              onRefresh={fetchEmployees}
              onDeleted={handleEmployeeDeleted}
            />
          ))}
        </div>
      )}

      <ToastPortal toasts={toasts} />
    </div>
  )
}

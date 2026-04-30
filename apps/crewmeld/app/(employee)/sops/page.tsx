'use client'

import { useCallback, useEffect, useState } from 'react'
import { GitBranch, MoreVertical, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/core/utils/cn'
import { useTranslation } from '@/hooks/use-translation'
import { PermissionGuard } from '../components/permission-guard'

interface SopListItem {
  id: string
  name: string
  description: string | null
  triggerType: string
  isActive: boolean
  version: number
  createdAt: string
  updatedAt: string
}

// TRIGGER_LABELS resolved dynamically via t() in component

interface SopCardProps {
  sop: SopListItem
  onRefresh: () => void
}

function SopCard({ sop, onRefresh }: SopCardProps) {
  const { t } = useTranslation()
  const TRIGGER_LABELS: Record<string, string> = {
    manual: t('sops.triggerManual'),
    scheduled: t('sops.triggerScheduled'),
    event: t('sops.triggerEvent'),
  }
  const [isUpdating, setIsUpdating] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const handleDelete = useCallback(async () => {
    setIsUpdating(true)
    try {
      const res = await fetch(`/api/employee/sops/${sop.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || t('common.operationFailed'))
      }
      onRefresh()
    } finally {
      setIsUpdating(false)
    }
  }, [sop.id, onRefresh])

  const handleToggleActive = useCallback(async () => {
    setIsUpdating(true)
    try {
      const res = await fetch(`/api/employee/sops/${sop.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !sop.isActive }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || t('common.operationFailed'))
      }
      onRefresh()
    } finally {
      setIsUpdating(false)
    }
  }, [sop.id, sop.isActive, onRefresh])

  return (
    <>
      <Card
        className={cn('transition-shadow hover:shadow-md', isUpdating && 'opacity-60')}
        data-testid={`sop-list:card:${sop.id}`}
      >
        <CardHeader className='flex flex-row items-center justify-between pb-3'>
          <Link
            href={`/sops/${sop.id}/edit`}
            className='font-semibold text-base text-gray-900 hover:text-blue-600'
          >
            {sop.name}
          </Link>
          <div className='flex items-center gap-2'>
            <Badge
              variant='outline'
              className={cn(
                sop.isActive
                  ? 'border-green-200 bg-green-100 text-green-700'
                  : 'border-gray-200 bg-gray-100 text-gray-500'
              )}
            >
              {sop.isActive ? t('common.enabled') : t('common.disabled')}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' size='icon' className='h-8 w-8' disabled={isUpdating}>
                  <MoreVertical className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem asChild>
                  <Link href={`/sops/${sop.id}/edit`}>{t('common.edit')}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/sops/${sop.id}/executions`}>{t('sops.executions')}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleToggleActive}>
                  {sop.isActive ? t('common.disable') : t('common.enable')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <PermissionGuard requires='sop:delete'>
                  <DropdownMenuItem
                    className='text-red-600 focus:text-red-600'
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    {t('common.delete')}
                  </DropdownMenuItem>
                </PermissionGuard>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          <p className='mb-4 min-h-[2.75rem] text-muted-foreground text-sm leading-relaxed'>
            {sop.description || t('sops.noDescription')}
          </p>
          <div className='flex items-center gap-4 text-gray-500 text-xs'>
            <span>{TRIGGER_LABELS[sop.triggerType] ?? sop.triggerType}</span>
            <span>v{sop.version}</span>
            <span>{new Date(sop.updatedAt).toLocaleDateString()}</span>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('sops.confirmDeleteDesc', { name: sop.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className='bg-red-600 hover:bg-red-700 focus:ring-red-600'
            >
              {t('common.delete')}
            </AlertDialogAction>
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

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  const { t } = useTranslation()
  return (
    <div className='flex min-h-[60vh] flex-col items-center justify-center'>
      <div className='text-center'>
        <GitBranch className='mx-auto mb-4 h-12 w-12 text-gray-300' />
        <h3 className='mb-2 font-semibold text-gray-900 text-xl'>
          {hasFilters ? t('sops.noMatch') : t('sops.empty')}
        </h3>
        <p className='mb-6 text-gray-500 text-sm'>
          {hasFilters ? t('sops.noMatchHint') : t('sops.emptyHint')}
        </p>
        {!hasFilters && (
          <PermissionGuard requires='sop:create'>
            <Button asChild>
              <Link href='/sops/new'>
                <Plus className='h-4 w-4' />
                {t('sops.create')}
              </Link>
            </Button>
          </PermissionGuard>
        )}
      </div>
    </div>
  )
}

export default function SopsPage() {
  const { t } = useTranslation()
  const [sops, setSops] = useState<SopListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchSops = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (searchQuery.trim()) params.append('search', searchQuery.trim())

      const res = await fetch(`/api/employee/sops?${params}`)
      if (!res.ok) throw new Error(t('sops.fetchFailed'))
      const json = await res.json()
      setSops(json.data?.items ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.unknownError'))
    } finally {
      setIsLoading(false)
    }
  }, [searchQuery])

  useEffect(() => {
    const timer = setTimeout(fetchSops, searchQuery ? 300 : 0)
    return () => clearTimeout(timer)
  }, [fetchSops, searchQuery])

  const hasFilters = searchQuery.trim() !== ''

  return (
    <div>
      <div className='mb-6 flex items-center justify-between'>
        <h1 className='font-bold text-2xl text-gray-900'>{t('sops.title')}</h1>
        <PermissionGuard requires='sop:create'>
          <Button asChild data-testid='sop-list:create'>
            <Link href='/sops/new'>
              <Plus className='h-4 w-4' />
              {t('sops.create')}
            </Link>
          </Button>
        </PermissionGuard>
      </div>

      <div className='mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4'>
        <div className='relative flex-1'>
          <Search className='-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground' />
          <Input
            type='text'
            placeholder={t('sops.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className='pl-9'
            data-testid='sop-list:search'
          />
        </div>
      </div>

      {error && (
        <div className='mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm'>
          <p>{error}</p>
          <button
            onClick={fetchSops}
            className='mt-2 font-medium text-red-800 underline hover:no-underline'
          >
            {t('dashboard.reload')}
          </button>
        </div>
      )}

      {isLoading ? (
        <LoadingSkeleton />
      ) : sops.length === 0 && !error ? (
        <EmptyState hasFilters={hasFilters} />
      ) : (
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {sops.map((sop) => (
            <SopCard key={sop.id} sop={sop} onRefresh={fetchSops} />
          ))}
        </div>
      )}
    </div>
  )
}

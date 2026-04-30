'use client'

import { useState } from 'react'
import type { ContactMethod } from '@crewmeld/db/schema'
import { Edit2, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useTranslation } from '@/hooks/use-translation'

// CONTACT_TYPE_LABELS resolved dynamically via t() in component

interface HumanEmployee {
  id: string
  name: string
  title: string
  department: string | null
  contactMethods: ContactMethod[]
  createdAt: string
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface HumanEmployeeTableProps {
  employees: HumanEmployee[]
  pagination: Pagination
  onEdit: (employee: HumanEmployee) => void
  onDelete: (id: string) => Promise<void>
  onPageChange: (page: number) => void
  isLoading: boolean
}

export function HumanEmployeeTable({
  employees,
  pagination,
  onEdit,
  onDelete,
  onPageChange,
  isLoading,
}: HumanEmployeeTableProps) {
  const { t } = useTranslation()
  const CONTACT_TYPE_LABELS: Record<string, string> = {
    email: t('humanEmployees.contactEmail'),
    wecom: t('humanEmployees.contactWecom'),
    dingtalk: t('humanEmployees.contactDingtalk'),
    feishu: t('humanEmployees.contactFeishu'),
  }
  const [deleteTarget, setDeleteTarget] = useState<HumanEmployee | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    setDeleteError('')
    try {
      await onDelete(deleteTarget.id)
      setDeleteTarget(null)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : t('humanEmployees.deleteFailed'))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <div className='rounded-md border' data-testid='human-emp-table:container'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-32'>{t('humanEmployees.tableName')}</TableHead>
              <TableHead className='w-32'>{t('humanEmployees.tableTitle')}</TableHead>
              <TableHead className='w-32'>{t('humanEmployees.tableDepartment')}</TableHead>
              <TableHead>{t('humanEmployees.tableContact')}</TableHead>
              <TableHead className='w-40'>{t('humanEmployees.tableCreatedAt')}</TableHead>
              <TableHead className='w-24 text-right'>{t('humanEmployees.tableActions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className='h-24 text-center text-gray-400'>
                  {t('common.loading')}
                </TableCell>
              </TableRow>
            ) : employees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className='h-24 text-center text-gray-400'>
                  {t('common.noData')}
                </TableCell>
              </TableRow>
            ) : (
              employees.map((emp) => (
                <TableRow key={emp.id} data-testid={`human-emp-table:row:${emp.id}`}>
                  <TableCell className='font-medium'>{emp.name}</TableCell>
                  <TableCell>{emp.title}</TableCell>
                  <TableCell>{emp.department ?? '-'}</TableCell>
                  <TableCell>
                    <div className='flex flex-wrap gap-1'>
                      {(emp.contactMethods ?? []).map((cm, i) => (
                        <Badge key={i} variant='secondary' className='text-xs'>
                          {CONTACT_TYPE_LABELS[cm.type] ?? cm.type}
                        </Badge>
                      ))}
                      {(!emp.contactMethods || emp.contactMethods.length === 0) && (
                        <span className='text-gray-400'>-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className='text-gray-500 text-sm'>
                    {new Date(emp.createdAt).toLocaleDateString('zh-CN')}
                  </TableCell>
                  <TableCell className='text-right'>
                    <div className='flex justify-end gap-1'>
                      <Button
                        variant='ghost'
                        size='icon'
                        onClick={() => onEdit(emp)}
                        data-testid={`human-emp-table:edit:${emp.id}`}
                      >
                        <Edit2 className='h-4 w-4' />
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon'
                        onClick={() => setDeleteTarget(emp)}
                        data-testid={`human-emp-table:delete:${emp.id}`}
                      >
                        <Trash2 className='h-4 w-4 text-red-500' />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pagination.totalPages > 1 && (
        <div className='mt-4 flex items-center justify-between text-gray-500 text-sm'>
          <span>
            {t('common.total')} {pagination.total} {t('common.items')}
          </span>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
              data-testid='human-emp-table:page:prev'
            >
              {t('common.previous')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onPageChange(pagination.page + 1)}
              data-testid='human-emp-table:page:next'
            >
              {t('common.next')}
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent className='sm:max-w-sm'>
          <DialogHeader>
            <DialogTitle>{t('humanEmployees.confirmDeleteTitle')}</DialogTitle>
          </DialogHeader>
          <p className='text-gray-600 text-sm'>
            {t('humanEmployees.confirmDeleteDesc', { name: deleteTarget?.name ?? '' })}
          </p>
          {deleteError && <p className='text-red-500 text-sm'>{deleteError}</p>}
          <DialogFooter>
            <Button variant='outline' onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              {t('common.cancel')}
            </Button>
            <Button
              variant='destructive'
              onClick={handleDelete}
              disabled={isDeleting}
              data-testid='dialog:delete-human-emp:confirm'
            >
              {isDeleting ? t('humanEmployees.deleting') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

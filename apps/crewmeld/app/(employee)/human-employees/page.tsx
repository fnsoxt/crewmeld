'use client'

import { useState } from 'react'
import type { ContactMethod } from '@crewmeld/db/schema'
import { Search, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/hooks/use-translation'
import { PermissionGuard } from '../components/permission-guard'
import { HumanEmployeeFormDialog } from './components/human-employee-form-dialog'
import { HumanEmployeeTable } from './components/human-employee-table'
import { useHumanEmployees } from './hooks/use-human-employees'

interface EditTarget {
  id: string
  name: string
  title: string
  department: string | null
  contactMethods: ContactMethod[]
}

export default function HumanEmployeesPage() {
  const {
    employees,
    pagination,
    search,
    isLoading,
    create,
    update,
    remove,
    handleSearch,
    handlePageChange,
  } = useHumanEmployees()

  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)

  const handleCreate = () => {
    setEditTarget(null)
    setFormOpen(true)
  }

  const handleEdit = (emp: EditTarget) => {
    setEditTarget(emp)
    setFormOpen(true)
  }

  const handleSubmit = async (data: {
    name: string
    title: string
    department: string
    contactMethods: ContactMethod[]
  }) => {
    if (editTarget) {
      await update(editTarget.id, {
        name: data.name,
        title: data.title,
        department: data.department || undefined,
        contactMethods: data.contactMethods,
      })
    } else {
      await create({
        name: data.name,
        title: data.title,
        department: data.department || undefined,
        contactMethods: data.contactMethods,
      })
    }
  }

  const { t } = useTranslation()

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <h1 className='font-bold text-2xl text-gray-900'>{t('humanEmployees.title')}</h1>
        <PermissionGuard requires='employee:edit'>
          <Button onClick={handleCreate} data-testid='human-emp-list:create'>
            <UserPlus className='mr-2 h-4 w-4' />
            {t('humanEmployees.create')}
          </Button>
        </PermissionGuard>
      </div>

      <div className='relative max-w-sm'>
        <Search className='-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-gray-400' />
        <Input
          className='pl-9'
          placeholder={t('humanEmployees.searchPlaceholder')}
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          data-testid='human-emp-list:search'
        />
      </div>

      <HumanEmployeeTable
        employees={employees}
        pagination={pagination}
        onEdit={handleEdit}
        onDelete={remove}
        onPageChange={handlePageChange}
        isLoading={isLoading}
      />

      <HumanEmployeeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        initialData={editTarget ?? undefined}
        mode={editTarget ? 'edit' : 'create'}
      />
    </div>
  )
}

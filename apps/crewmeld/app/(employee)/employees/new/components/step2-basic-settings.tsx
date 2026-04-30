'use client'

import { useState } from 'react'
import { ChevronDown, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/core/utils/cn'
import type { FlatRole } from '@/lib/types/role'
import { isBuiltinRoleId } from '@/data/builtin-roles'
import { useTranslation } from '@/hooks/use-translation'
import type { EmployeeConfig } from '../types'
import { DEFAULT_AVATARS } from '../types'
import { AvatarPickerDialog } from './avatar-picker-dialog'
import { NewRoleDialog } from './new-role-dialog'

interface Step2BasicSettingsProps {
  flatRoles: FlatRole[]
  isLoadingTemplates: boolean
  selectedRoleName: string | null
  onSelectRole: (role: FlatRole) => void
  onDeselectRole: () => void
  onRoleCreated: (role: FlatRole) => void
  onRoleDeleted: (role: FlatRole) => Promise<void>
  config: EmployeeConfig
  onConfigChange: (config: EmployeeConfig) => void
}

export function Step2BasicSettings({
  flatRoles,
  isLoadingTemplates,
  selectedRoleName,
  onSelectRole,
  onDeselectRole,
  onRoleCreated,
  onRoleDeleted,
  config,
  onConfigChange,
}: Step2BasicSettingsProps) {
  const { t } = useTranslation()
  const [rolePickerOpen, setRolePickerOpen] = useState(false)
  const [newRoleDialogOpen, setNewRoleDialogOpen] = useState(false)
  const [deleteTargetRole, setDeleteTargetRole] = useState<FlatRole | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const selectedRole = flatRoles.find((r) => r.name === selectedRoleName) ?? null

  const handleConfirmDelete = async () => {
    if (!deleteTargetRole) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await onRoleDeleted(deleteTargetRole)
      setDeleteTargetRole(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t('employees.deleteFailed'))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      {/* Role selection dialog */}
      <Dialog open={rolePickerOpen} onOpenChange={setRolePickerOpen}>
        <DialogContent className='max-w-2xl'>
          <DialogHeader>
            <div className='flex items-center justify-between pr-6'>
              <DialogTitle>{t('employees.selectRoleTitle')}</DialogTitle>
              <button
                onClick={() => {
                  setRolePickerOpen(false)
                  setNewRoleDialogOpen(true)
                }}
                className='flex items-center gap-1 rounded-lg border border-gray-300 border-dashed px-3 py-1.5 text-gray-500 text-sm transition-colors hover:border-blue-400 hover:text-blue-600'
                data-testid='basic-settings:new-role'
              >
                <Plus className='h-3.5 w-3.5' />
                {t('employees.roleCreate')}
              </button>
            </div>
          </DialogHeader>

          <div className='mt-2 max-h-[60vh] overflow-y-auto pr-1'>
            {isLoadingTemplates ? (
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className='h-24 animate-pulse rounded-xl border border-gray-200 bg-gray-100'
                  />
                ))}
              </div>
            ) : flatRoles.length === 0 ? (
              <div className='flex h-24 items-center justify-center rounded-xl border border-gray-300 border-dashed'>
                <p className='text-gray-400 text-sm'>{t('employees.noRoles')}</p>
              </div>
            ) : (
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                {flatRoles.map((role) => {
                  const isSelected = role.name === selectedRoleName
                  const isBuiltin = isBuiltinRoleId(role.id)
                  return (
                    <div
                      key={role.id}
                      className={cn(
                        'group relative flex flex-col rounded-xl border p-4 text-left transition-all',
                        isSelected
                          ? 'border-blue-600 bg-blue-50 shadow-sm'
                          : isBuiltin
                            ? 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:shadow-sm'
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                      )}
                    >
                      <button
                        type='button'
                        onClick={() => {
                          if (isSelected) {
                            onDeselectRole()
                          } else {
                            onSelectRole(role)
                          }
                          setRolePickerOpen(false)
                        }}
                        className='flex flex-1 flex-col text-left'
                      >
                        <div className='mb-1'>
                          <span className='font-semibold text-gray-900 text-sm'>{role.name}</span>
                        </div>
                        <p className='mb-2 line-clamp-2 flex-1 text-gray-500 text-xs leading-relaxed'>
                          {role.description || t('employees.noDescription')}
                        </p>
                        <p className='text-[11px] text-gray-400'>{role.category}</p>
                      </button>
                      {!isBuiltin && (
                        <button
                          type='button'
                          onClick={(e) => {
                            e.stopPropagation()
                            setRolePickerOpen(false)
                            setDeleteTargetRole(role)
                            setDeleteError(null)
                          }}
                          className='absolute top-2 right-2 hidden rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 group-hover:flex'
                          title={t('employees.deleteRole')}
                        >
                          <Trash2 className='h-3.5 w-3.5' />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <NewRoleDialog
        open={newRoleDialogOpen}
        onOpenChange={setNewRoleDialogOpen}
        onCreated={(role) => {
          onRoleCreated(role)
          setNewRoleDialogOpen(false)
        }}
      />

      {/* Delete confirmation dialog - placed last for highest z-index */}
      <AlertDialog
        open={!!deleteTargetRole}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTargetRole(null)
            setDeleteError(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('employees.deleteRole')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('employees.deleteRoleConfirm', { name: deleteTargetRole?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className='rounded-lg bg-red-50 px-4 py-2.5 text-red-600 text-sm'>{deleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className='bg-red-600 hover:bg-red-700'
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Main content */}
      <div>
        <h2 className='mb-2 font-semibold text-gray-900 text-lg'>{t('employees.step2Title')}</h2>
        <p className='mb-6 text-gray-500 text-sm'>{t('employees.step2Subtitle')}</p>

        {/* Role selection button */}
        <div className='mb-6'>
          <span className='mb-2 block font-medium text-gray-700 text-sm'>
            {t('employees.selectRoleLabel')}
          </span>
          <button
            type='button'
            onClick={() => setRolePickerOpen(true)}
            className={cn(
              'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-all hover:border-blue-400',
              selectedRole ? 'border-blue-600 bg-blue-50' : 'border-gray-300 bg-white'
            )}
          >
            {selectedRole ? (
              <div className='min-w-0'>
                <p className='font-semibold text-gray-900 text-sm'>{selectedRole.name}</p>
                <p className='truncate text-gray-500 text-xs'>
                  {selectedRole.description || t('common.noDescription')}
                </p>
              </div>
            ) : (
              <span className='text-gray-400 text-sm'>{t('employees.selectRolePlaceholder')}</span>
            )}
            <ChevronDown className='ml-2 h-4 w-4 shrink-0 text-gray-400' />
          </button>
        </div>

        {/* Basic info fields */}
        <div className='mx-auto max-w-2xl space-y-6'>
          <AvatarQuickPicker
            value={config.avatar}
            onSelect={(emoji) => onConfigChange({ ...config, avatar: emoji })}
          />

          <div>
            <label
              htmlFor='step2-employee-name'
              className='mb-1 block font-medium text-gray-700 text-sm'
            >
              {t('employees.employeeNameLabel')} <span className='text-red-500'>*</span>
            </label>
            <Input
              id='step2-employee-name'
              type='text'
              value={config.name}
              onChange={(e) => onConfigChange({ ...config, name: e.target.value })}
              placeholder={t('employees.employeeNamePlaceholder')}
              maxLength={50}
            />
            <p className='mt-1 text-gray-400 text-xs'>{t('employees.employeeNameHint')}</p>
          </div>

          <div>
            <label
              htmlFor='step2-employee-description'
              className='mb-1 block font-medium text-gray-700 text-sm'
            >
              {t('employees.descriptionLabel')}
            </label>
            <textarea
              id='step2-employee-description'
              value={config.description}
              onChange={(e) => onConfigChange({ ...config, description: e.target.value })}
              placeholder={t('employees.descriptionPlaceholder')}
              maxLength={200}
              rows={3}
              className='w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-700 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
            />
          </div>

          <div>
            <label
              htmlFor='step2-employee-persona'
              className='mb-1 block font-medium text-gray-700 text-sm'
            >
              {t('employees.personaLabel')}
            </label>
            <textarea
              id='step2-employee-persona'
              value={config.persona}
              onChange={(e) => onConfigChange({ ...config, persona: e.target.value })}
              placeholder={t('employees.personaPlaceholder')}
              rows={4}
              className='w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-700 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
            />
          </div>
        </div>
      </div>
    </>
  )
}

interface AvatarQuickPickerProps {
  value: string
  onSelect: (emoji: string) => void
}

function AvatarQuickPicker({ value, onSelect }: AvatarQuickPickerProps) {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const defaultSet = DEFAULT_AVATARS as readonly string[]
  const showExtra = value && !defaultSet.includes(value)

  return (
    <div>
      <span className='mb-1 block font-medium text-gray-700 text-sm'>
        {t('employees.avatarLabel')}
      </span>
      <div className='flex flex-wrap gap-2'>
        {DEFAULT_AVATARS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onSelect(emoji)}
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-xl border-2 text-2xl transition-colors',
              value === emoji
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            )}
          >
            {emoji}
          </button>
        ))}
        {showExtra && (
          <button
            onClick={() => onSelect(value)}
            className='flex h-12 w-12 items-center justify-center rounded-xl border-2 border-blue-600 bg-blue-50 text-2xl'
          >
            {value}
          </button>
        )}
        <button
          data-testid='avatar-picker:more'
          onClick={() => setDialogOpen(true)}
          className='flex h-12 w-12 items-center justify-center rounded-xl border-2 border-gray-300 border-dashed text-gray-400 transition-colors hover:border-gray-400 hover:text-gray-500'
        >
          <MoreHorizontal className='h-5 w-5' />
        </button>
      </div>
      <AvatarPickerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        value={value}
        onSelect={onSelect}
      />
    </div>
  )
}

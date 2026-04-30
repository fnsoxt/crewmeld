'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { FlatRole } from '@/lib/types/role'
import { useTranslation } from '@/hooks/use-translation'

interface NewRoleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (role: FlatRole) => void
}

export function NewRoleDialog({ open, onOpenChange, onCreated }: NewRoleDialogProps) {
  const { t } = useTranslation()
  const [roleName, setRoleName] = useState('')
  const [description, setDescription] = useState('')
  const [persona, setPersona] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!roleName.trim()) return
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/employee/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roleName.trim(),
          description: description.trim(),
          persona: persona.trim(),
        }),
      })
      const json = await res.json()
      if (!json.success) {
        setError(json.error ?? t('employees.roleCreateFailed'))
        return
      }
      onCreated({
        id: json.data.id,
        name: json.data.name,
        blockType: json.data.blockType,
        description: json.data.description,
        persona: json.data.persona,
        category: json.data.category,
        icon: json.data.icon,
      })
      // Reset form
      setRoleName('')
      setDescription('')
      setPersona('')
      onOpenChange(false)
    } catch {
      setError(t('common.networkError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('employees.roleTitle')}</DialogTitle>
        </DialogHeader>

        <div className='space-y-4 py-2'>
          {error && (
            <div className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-600 text-sm'>
              {error}
            </div>
          )}

          <div>
            <label htmlFor='new-role-name' className='mb-1 block font-medium text-gray-700 text-sm'>
              {t('employees.roleName')} <span className='text-red-500'>*</span>
            </label>
            <Input
              id='new-role-name'
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder={t('employees.roleNamePlaceholder')}
              maxLength={50}
              data-testid='new-role-dialog:input:name'
            />
          </div>

          <div>
            <label
              htmlFor='new-role-description'
              className='mb-1 block font-medium text-gray-700 text-sm'
            >
              {t('employees.description')}
            </label>
            <textarea
              id='new-role-description'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('employees.roleDescriptionPlaceholder')}
              maxLength={200}
              rows={3}
              className='w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-700 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
              data-testid='new-role-dialog:input:description'
            />
          </div>

          <div>
            <label
              htmlFor='new-role-persona'
              className='mb-1 block font-medium text-gray-700 text-sm'
            >
              {t('employees.rolePersonaLabel')}
            </label>
            <textarea
              id='new-role-persona'
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder={t('employees.rolePersonaPlaceholder')}
              maxLength={500}
              rows={4}
              className='w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-700 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
              data-testid='new-role-dialog:input:persona'
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!roleName.trim() || isSubmitting}
            data-testid='new-role-dialog:submit'
          >
            {isSubmitting ? t('employees.roleCreating') : t('employees.roleCreate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

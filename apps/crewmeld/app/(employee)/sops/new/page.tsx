'use client'

import { useCallback, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useTranslation } from '@/hooks/use-translation'

export default function NewSopPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = useCallback(async () => {
    if (!name.trim()) {
      setError(t('sops.newNameRequired'))
      return
    }

    setIsCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/employee/sops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          triggerType: 'manual',
          triggerConfig: {},
          sopTimeoutMinutes: 1440,
          maxRejectionCycles: 3,
          nodes: [],
          edges: [],
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || t('sops.newCreateFailed'))
      }

      const json = await res.json()
      const sopId = json.data?.id
      if (sopId) {
        router.push(`/sops/${sopId}/edit`)
      } else {
        router.push('/sops')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sops.newCreateFailed'))
      setIsCreating(false)
    }
  }, [name, description, router, t])

  return (
    <div className='mx-auto max-w-lg'>
      <button
        onClick={() => router.push('/sops')}
        className='mb-6 flex items-center gap-1 text-gray-500 text-sm hover:text-gray-900'
      >
        <ArrowLeft className='h-4 w-4' />
        {t('sops.newBackToList')}
      </button>

      <h1 className='mb-6 font-bold text-2xl text-gray-900'>{t('sops.newTitle')}</h1>

      <div className='space-y-4'>
        <div>
          <Label htmlFor='sop-name' className='mb-1.5'>
            {t('sops.newNameLabel')}
          </Label>
          <Input
            id='sop-name'
            placeholder={t('sops.newNamePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid='sop-form:input:name'
          />
        </div>

        <div>
          <Label htmlFor='sop-description' className='mb-1.5'>
            {t('sops.newDescLabel')}
          </Label>
          <Textarea
            id='sop-description'
            placeholder={t('sops.newDescPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            data-testid='sop-form:input:description'
          />
        </div>

        {error && (
          <div className='rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 text-sm'>
            {error}
          </div>
        )}

        <Button
          onClick={handleCreate}
          disabled={isCreating || !name.trim()}
          className='w-full'
          data-testid='sop-form:submit'
        >
          {isCreating ? t('sops.newCreating') : t('sops.newCreateAndEdit')}
        </Button>
      </div>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslation } from '@/hooks/use-translation'
import type { ScheduledTaskItem } from '../types'

interface SopOption {
  id: string
  name: string
}

interface ScheduledTaskFormProps {
  open: boolean
  editingTask: ScheduledTaskItem | null
  onClose: () => void
  onSaved: () => void
}

export function ScheduledTaskForm({ open, editingTask, onClose, onSaved }: ScheduledTaskFormProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [sopId, setSopId] = useState('')
  const [cronPreset, setCronPreset] = useState('__custom__')
  const [cron, setCron] = useState('')
  const [timezone, setTimezone] = useState('Asia/Shanghai')
  const [sopOptions, setSopOptions] = useState<SopOption[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const CRON_PRESETS = useMemo(
    () =>
      [
        { label: t('tasks.scheduledPresetDaily9'), value: '0 9 * * *' },
        { label: t('tasks.scheduledPresetDaily18'), value: '0 18 * * *' },
        { label: t('tasks.scheduledPresetWeekday9'), value: '0 9 * * 1-5' },
        { label: t('tasks.scheduledPresetMonday9'), value: '0 9 * * 1' },
        { label: t('tasks.scheduledPresetMonthly'), value: '0 9 1 * *' },
        { label: t('tasks.scheduledPresetHourly'), value: '0 * * * *' },
        { label: t('tasks.scheduledPresetEvery30m'), value: '*/30 * * * *' },
        { label: t('tasks.scheduledPresetCustom'), value: '__custom__' },
      ] as const,
    [t]
  )

  // load SOP list
  useEffect(() => {
    if (!open) return
    fetch('/api/employee/sops?pageSize=100')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data?.items) {
          setSopOptions(
            data.data.items.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))
          )
        }
      })
      .catch(() => {})
  }, [open])

  // edit mode init
  useEffect(() => {
    if (editingTask) {
      setName(editingTask.name)
      setSopId(editingTask.sopDefinitionId)
      setCron(editingTask.cron)
      setTimezone(editingTask.timezone)
      const matchPreset = CRON_PRESETS.find((p) => p.value === editingTask.cron)
      setCronPreset(matchPreset ? matchPreset.value : '__custom__')
    } else {
      setName('')
      setSopId('')
      setCron('')
      setTimezone('Asia/Shanghai')
      setCronPreset('__custom__')
    }
    setError(null)
  }, [editingTask, open, CRON_PRESETS])

  const handlePresetChange = (value: string) => {
    setCronPreset(value)
    if (value !== '__custom__') {
      setCron(value)
    }
  }

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setError(t('tasks.scheduledNameRequired'))
      return
    }
    if (!sopId) {
      setError(t('tasks.scheduledSopRequired'))
      return
    }
    if (!cron.trim()) {
      setError(t('tasks.scheduledTimeRequired'))
      return
    }

    setSaving(true)
    setError(null)

    try {
      const url = editingTask
        ? `/api/employee/scheduled-tasks/${editingTask.id}`
        : '/api/employee/scheduled-tasks'
      const method = editingTask ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          sopDefinitionId: sopId,
          cron: cron.trim(),
          timezone,
        }),
      })
      const json = await res.json()
      if (json.success) {
        onSaved()
        onClose()
      } else {
        setError(json.error ?? t('tasks.scheduledSaveFailed'))
      }
    } catch {
      setError(t('common.networkError'))
    } finally {
      setSaving(false)
    }
  }, [name, sopId, cron, timezone, editingTask, onSaved, onClose, t])

  if (!open) return null

  return (
    <div
      className='fixed inset-0 z-40 flex items-center justify-center bg-black/30'
      onClick={onClose}
    >
      <div
        className='w-[520px] rounded-2xl bg-white p-6 shadow-2xl'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='mb-5 flex items-center justify-between'>
          <h2 className='font-semibold text-gray-900 text-lg'>
            {editingTask ? t('tasks.scheduledEditTitle') : t('tasks.scheduledCreateTitle')}
          </h2>
          <button type='button' onClick={onClose} className='rounded-lg p-1.5 hover:bg-gray-100'>
            <X className='h-4 w-4 text-gray-400' />
          </button>
        </div>

        {error && (
          <div className='mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-600 text-sm'>
            {error}
          </div>
        )}

        <div className='space-y-4'>
          <div>
            <Label className='mb-1.5 text-gray-500 text-xs'>{t('tasks.scheduledTaskName')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('tasks.scheduledTaskNamePlaceholder')}
              data-testid='scheduled-task-form:input:name'
            />
          </div>

          <div>
            <Label className='mb-1.5 text-gray-500 text-xs'>{t('tasks.scheduledSelectSop')}</Label>
            <Select value={sopId} onValueChange={setSopId}>
              <SelectTrigger data-testid='scheduled-task-form:select:sop'>
                <SelectValue placeholder={t('tasks.scheduledSelectSopPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {sopOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className='mb-1.5 text-gray-500 text-xs'>
              {t('tasks.scheduledExecutionTime')}
            </Label>
            <Select value={cronPreset} onValueChange={handlePresetChange}>
              <SelectTrigger data-testid='scheduled-task-form:select:preset'>
                <SelectValue placeholder={t('tasks.scheduledSelectFrequency')} />
              </SelectTrigger>
              <SelectContent>
                {CRON_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cronPreset === '__custom__' && (
              <Input
                className='mt-2'
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                placeholder={t('tasks.scheduledCronPlaceholder')}
                data-testid='scheduled-task-form:input:cron'
              />
            )}
            {cron && <p className='mt-1.5 font-mono text-gray-400 text-xs'>{cron}</p>}
          </div>

          <div>
            <Label className='mb-1.5 text-gray-500 text-xs'>{t('tasks.scheduledTimezone')}</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger data-testid='scheduled-task-form:select:timezone'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='Asia/Shanghai'>{t('tasks.scheduledTzShanghai')}</SelectItem>
                <SelectItem value='Asia/Tokyo'>{t('tasks.scheduledTzTokyo')}</SelectItem>
                <SelectItem value='UTC'>UTC</SelectItem>
                <SelectItem value='America/New_York'>{t('tasks.scheduledTzNewYork')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className='mt-6 flex justify-end gap-3'>
          <Button variant='outline' onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className='bg-violet-600 hover:bg-violet-700'
          >
            {saving ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                {t('common.saving')}
              </>
            ) : (
              t('common.save')
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { ConnectionType } from '@/lib/connectors/types'
import { CONNECTION_CONFIG_FIELDS, CONNECTION_TYPE_I18N_KEYS } from '@/lib/connectors/types'
import { copyToClipboard } from '@/lib/core/utils/clipboard'
import { useTranslation } from '@/hooks/use-translation'
import type { ChannelRecord } from '../hooks/use-channels'

interface EditChannelDialogProps {
  channel: ChannelRecord | null
  onOpenChange: (open: boolean) => void
  onUpdated: () => void
}

export function EditChannelDialog({ channel, onOpenChange, onUpdated }: EditChannelDialogProps) {
  const { t, tMessage } = useTranslation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [config, setConfig] = useState<Record<string, string | number | boolean>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (channel) {
      setName(channel.name)
      setDescription(channel.description ?? '')
      const cfg: Record<string, string | number | boolean> = {}
      for (const [k, v] of Object.entries(channel.config)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          cfg[k] = v
        }
      }
      setConfig(cfg)
      setError(null)
    }
  }, [channel])

  const handleSave = useCallback(async () => {
    if (!channel || !name.trim()) return
    setIsSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
      }

      const cleanConfig: Record<string, unknown> = {}
      let hasConfigChanges = false
      for (const [k, v] of Object.entries(config)) {
        if (typeof v === 'string' && v.includes('****')) continue
        cleanConfig[k] = v
        hasConfigChanges = true
      }
      if (hasConfigChanges) {
        payload.config = cleanConfig
      }

      const res = await fetch(`/api/employee/channels/${channel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (json.success) {
        onOpenChange(false)
        onUpdated()
      } else {
        setError(tMessage(json) || t('channels.wizardUpdateFailed'))
      }
    } catch {
      setError(t('common.networkError'))
    } finally {
      setIsSaving(false)
    }
  }, [channel, name, description, config, onOpenChange, onUpdated])

  const fields = channel ? (CONNECTION_CONFIG_FIELDS[channel.type as ConnectionType] ?? []) : []

  const handleCopy = useCallback(() => {
    const lines: string[] = []
    lines.push(`${t('channels.wizardChannelName')}: ${name}`)
    if (description) lines.push(`${t('common.description')}: ${description}`)
    for (const field of fields) {
      const value = config[field.key]
      if (value !== undefined && value !== '') {
        lines.push(`${t(field.label)}: ${value}`)
      }
    }
    copyToClipboard(lines.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [name, description, config, fields, t])

  return (
    <Dialog open={channel !== null} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[90vh] max-w-md flex-col overflow-hidden'>
        <DialogHeader>
          <DialogTitle>
            {t('channels.editTitle', {
              type: channel
                ? CONNECTION_TYPE_I18N_KEYS[channel.type as ConnectionType]
                  ? t(CONNECTION_TYPE_I18N_KEYS[channel.type as ConnectionType])
                  : channel.type
                : '',
            })}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className='mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-red-600 text-xs'>
            {error}
          </div>
        )}

        <div className='flex-1 overflow-y-auto pr-1'>
          <div className='space-y-4'>
            <div>
              <label
                htmlFor='edit-channel-name'
                className='mb-1 block font-medium text-gray-700 text-sm'
              >
                {t('channels.wizardChannelName')} <span className='text-red-500'>*</span>
              </label>
              <Input
                id='edit-channel-name'
                data-testid='edit-channel:input:name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
            </div>
            <div>
              <label
                htmlFor='edit-channel-description'
                className='mb-1 block font-medium text-gray-700 text-sm'
              >
                {t('common.description')}
              </label>
              <Input
                id='edit-channel-description'
                data-testid='edit-channel:input:description'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
              />
            </div>
            {fields.map((field) => (
              <div key={field.key}>
                <label
                  htmlFor={`edit-channel-field-${field.key}`}
                  className='mb-1 block font-medium text-gray-700 text-sm'
                >
                  {t(field.label)}
                </label>
                {field.type === 'boolean' ? (
                  <div className='flex items-center gap-2 pt-1'>
                    <Switch
                      id={`edit-channel-field-${field.key}`}
                      data-testid={`edit-channel:input:${field.key}`}
                      checked={Boolean(config[field.key])}
                      onCheckedChange={(checked) => setConfig({ ...config, [field.key]: checked })}
                    />
                    <span className='text-gray-500 text-xs'>
                      {config[field.key] ? t('common.enabled') : t('common.disabled')}
                    </span>
                  </div>
                ) : (
                  <Input
                    id={`edit-channel-field-${field.key}`}
                    data-testid={`edit-channel:input:${field.key}`}
                    type={
                      field.type === 'password'
                        ? 'password'
                        : field.type === 'number'
                          ? 'number'
                          : 'text'
                    }
                    value={(config[field.key] as string) ?? ''}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        [field.key]:
                          field.type === 'number' ? Number(e.target.value) : e.target.value,
                      })
                    }
                    placeholder={field.placeholder ? t(field.placeholder) : undefined}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className='mt-4 flex justify-between border-gray-100 border-t pt-3'>
          <Button variant='outline' size='sm' onClick={handleCopy} className='gap-1.5'>
            {copied ? <Check className='h-3.5 w-3.5' /> : <Copy className='h-3.5 w-3.5' />}
            {copied ? t('common.copied') : t('common.copy')}
          </Button>
          <div className='flex gap-2'>
            <Button variant='outline' onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !name.trim()}
              data-testid='edit-channel:save'
            >
              {isSaving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

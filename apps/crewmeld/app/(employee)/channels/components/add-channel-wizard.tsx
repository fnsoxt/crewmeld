'use client'

import { useCallback, useMemo, useState } from 'react'
import { Check, CheckCircle2, Copy, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { ConnectionTestResult, ConnectionType } from '@/lib/connectors/types'
import {
  CHANNEL_TYPE_LIST,
  CONNECTION_CONFIG_FIELDS,
  CONNECTION_TYPE_I18N_KEYS,
} from '@/lib/connectors/types'
import { copyToClipboard } from '@/lib/core/utils/clipboard'
import { cn } from '@/lib/core/utils/cn'
import { renderHealthMessage } from '@/lib/i18n/render-health-message'
import { useTranslation } from '@/hooks/use-translation'
import { ChannelTypeIcon } from './channel-type-icon'

interface AddChannelWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export function AddChannelWizard({ open, onOpenChange, onCreated }: AddChannelWizardProps) {
  const { t, tMessage } = useTranslation()
  const steps = useMemo(
    () => [
      t('channels.wizardStepSelect'),
      t('channels.wizardStepConfig'),
      t('channels.wizardStepTest'),
    ],
    [t]
  )
  const [step, setStep] = useState(1)
  const [selectedType, setSelectedType] = useState<ConnectionType | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [config, setConfig] = useState<Record<string, string | number | boolean>>({})
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const reset = useCallback(() => {
    setStep(1)
    setSelectedType(null)
    setName('')
    setDescription('')
    setConfig({})
    setTestResult(null)
    setIsTesting(false)
    setIsSaving(false)
    setError(null)
  }, [])

  const handleClose = useCallback(() => {
    reset()
    onOpenChange(false)
  }, [reset, onOpenChange])

  const handleTestConnection = useCallback(async () => {
    if (!selectedType) return
    setIsTesting(true)
    setTestResult(null)
    setError(null)
    try {
      const res = await fetch('/api/employee/connectors/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: selectedType, config }),
      })
      const json = await res.json()
      if (json.success) {
        setTestResult(json.data)
      } else {
        setError(tMessage(json) || t('channels.wizardTestFailed'))
      }
    } catch {
      setError(t('common.networkError'))
    } finally {
      setIsTesting(false)
    }
  }, [selectedType, config])

  const handleSave = useCallback(async () => {
    if (!selectedType || !name.trim()) return
    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/employee/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type: selectedType,
          description: description.trim() || undefined,
          config,
        }),
      })
      const json = await res.json()
      if (json.success) {
        handleClose()
        onCreated()
      } else {
        setError(tMessage(json) || t('channels.wizardSaveFailed'))
      }
    } catch {
      setError(t('common.networkError'))
    } finally {
      setIsSaving(false)
    }
  }, [selectedType, name, description, config, handleClose, onCreated])

  const canGoStep2 = selectedType !== null
  const canGoStep3 = name.trim().length > 0

  const fields = selectedType ? CONNECTION_CONFIG_FIELDS[selectedType] : []

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
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose()
      }}
    >
      <DialogContent className='flex max-h-[90vh] max-w-lg flex-col overflow-hidden'>
        <DialogHeader>
          <DialogTitle>{t('channels.wizardAddTitle')}</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className='mb-4 flex items-center justify-center gap-2'>
          {steps.map((label, i) => {
            const s = i + 1
            const isActive = s === step
            const isCompleted = s < step
            return (
              <div key={s} className='flex items-center'>
                <div className='flex flex-col items-center'>
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full font-medium text-xs',
                      isActive && 'bg-blue-600 text-white',
                      isCompleted && 'bg-green-600 text-white',
                      !isActive && !isCompleted && 'bg-gray-200 text-gray-500'
                    )}
                  >
                    {isCompleted ? '✓' : s}
                  </div>
                  <span
                    className={cn('mt-1 text-xs', isActive ? 'text-blue-600' : 'text-gray-400')}
                  >
                    {label}
                  </span>
                </div>
                {s < steps.length && (
                  <div
                    className={cn(
                      'mx-2 mt-[-1rem] h-px w-8',
                      s < step ? 'bg-green-600' : 'bg-gray-200'
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>

        {error && (
          <div className='mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-red-600 text-xs'>
            {error}
          </div>
        )}

        {/* Step 1: Select type */}
        {step === 1 && (
          <div className='flex min-h-0 flex-1 flex-col gap-3'>
            <p className='text-gray-500 text-sm'>{t('channels.wizardSelectHint')}</p>
            <div className='min-h-0 flex-1 overflow-y-auto'>
              <div className='grid grid-cols-2 gap-3'>
                {CHANNEL_TYPE_LIST.map((type) => (
                  <button
                    key={type}
                    data-testid={`channel-wizard:type:${type}`}
                    onClick={() => setSelectedType(type)}
                    className={cn(
                      'flex h-14 items-center gap-3 rounded-lg border p-3 text-left transition-all',
                      selectedType === type
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <div className='flex h-7 w-7 shrink-0 items-center justify-center'>
                      <ChannelTypeIcon type={type} size={28} />
                    </div>
                    <span className='truncate font-medium text-gray-900 text-sm'>
                      {t(CONNECTION_TYPE_I18N_KEYS[type])}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className='flex justify-end border-gray-100 border-t pt-3'>
              <Button
                onClick={() => setStep(2)}
                disabled={!canGoStep2}
                data-testid='channel-wizard:next-1'
              >
                {t('common.next')}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Config form */}
        {step === 2 && selectedType && (
          <div className='flex min-h-0 flex-1 flex-col gap-4'>
            <div className='flex-1 overflow-y-auto pr-1'>
              <div className='space-y-4'>
                <div>
                  <label
                    htmlFor='channel-wizard-name'
                    className='mb-1 block font-medium text-gray-700 text-sm'
                  >
                    {t('channels.wizardChannelName')} <span className='text-red-500'>*</span>
                  </label>
                  <Input
                    id='channel-wizard-name'
                    data-testid='channel-wizard:input:name'
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={`${t('channels.wizardExamplePrefix')}${t(CONNECTION_TYPE_I18N_KEYS[selectedType])}${t('common.mainChannel')}`}
                    maxLength={100}
                  />
                </div>
                <div>
                  <label
                    htmlFor='channel-wizard-description'
                    className='mb-1 block font-medium text-gray-700 text-sm'
                  >
                    {t('common.description')}
                  </label>
                  <Input
                    id='channel-wizard-description'
                    data-testid='channel-wizard:input:description'
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('channels.wizardOptional')}
                    maxLength={500}
                  />
                </div>
                {fields.map((field) => (
                  <div key={field.key}>
                    <label
                      htmlFor={`channel-wizard-field-${field.key}`}
                      className='mb-1 block font-medium text-gray-700 text-sm'
                    >
                      {t(field.label)}
                      {field.required && <span className='text-red-500'> *</span>}
                    </label>
                    {field.type === 'boolean' ? (
                      <div className='flex items-center gap-2 pt-1'>
                        <Switch
                          id={`channel-wizard-field-${field.key}`}
                          data-testid={`channel-wizard:input:${field.key}`}
                          checked={Boolean(config[field.key])}
                          onCheckedChange={(checked) =>
                            setConfig({ ...config, [field.key]: checked })
                          }
                        />
                        <span className='text-gray-500 text-xs'>
                          {config[field.key] ? t('common.enabled') : t('common.disabled')}
                        </span>
                      </div>
                    ) : (
                      <Input
                        id={`channel-wizard-field-${field.key}`}
                        data-testid={`channel-wizard:input:${field.key}`}
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
            <div className='flex justify-between border-gray-100 border-t pt-3'>
              <div className='flex gap-2'>
                <Button
                  variant='outline'
                  onClick={() => setStep(1)}
                  data-testid='channel-wizard:back-2'
                >
                  {t('common.previous')}
                </Button>
                <Button variant='outline' size='sm' onClick={handleCopy} className='gap-1.5'>
                  {copied ? <Check className='h-3.5 w-3.5' /> : <Copy className='h-3.5 w-3.5' />}
                  {copied ? t('common.copied') : t('common.copy')}
                </Button>
              </div>
              <Button
                onClick={() => {
                  setStep(3)
                  handleTestConnection()
                }}
                disabled={!canGoStep3}
                data-testid='channel-wizard:next-2'
              >
                {t('common.testConnection')}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Test result */}
        {step === 3 && (
          <div className='flex min-h-0 flex-1 flex-col gap-4'>
            <div className='flex-1 overflow-y-auto'>
              {isTesting && (
                <div className='flex flex-col items-center gap-3 py-8'>
                  <Loader2 className='h-8 w-8 animate-spin text-blue-600' />
                  <p className='text-gray-500 text-sm'>{t('channels.wizardTestingConnection')}</p>
                </div>
              )}
              {!isTesting && testResult && (
                <div className='flex flex-col items-center gap-3 py-6'>
                  {testResult.success ? (
                    <CheckCircle2 className='h-12 w-12 text-green-500' />
                  ) : (
                    <XCircle className='h-12 w-12 text-red-500' />
                  )}
                  <p
                    className={cn(
                      'font-medium text-sm',
                      testResult.success ? 'text-green-700' : 'text-red-700'
                    )}
                  >
                    {renderHealthMessage(
                      { key: testResult.messageKey, params: testResult.messageParams },
                      t
                    )}
                  </p>
                  <p className='text-gray-400 text-xs'>
                    {t('channels.wizardLatency', { ms: testResult.latencyMs })}
                  </p>
                  {testResult.details && (
                    <div className='w-full rounded-lg bg-gray-50 p-3 text-gray-600 text-xs'>
                      {Object.entries(testResult.details).map(([k, v]) => (
                        <div key={k}>
                          <span className='font-medium'>{k}:</span> {v}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {!isTesting && !testResult && !error && (
                <div className='py-8 text-center text-gray-400 text-sm'>
                  {t('channels.wizardWaitingTest')}
                </div>
              )}
            </div>
            <div className='flex justify-between border-gray-100 border-t pt-3'>
              <Button
                variant='outline'
                onClick={() => setStep(2)}
                data-testid='channel-wizard:back-3'
              >
                {t('common.previous')}
              </Button>
              <div className='flex gap-2'>
                <Button
                  variant='outline'
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  data-testid='channel-wizard:retest'
                >
                  {t('channels.wizardRetest')}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving || isTesting}
                  data-testid='channel-wizard:save'
                >
                  {isSaving ? t('common.saving') : t('channels.wizardSaveChannel')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Copy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ConnectionConfig } from '@/lib/connectors/types'
import { copyToClipboard } from '@/lib/core/utils/clipboard'
import { useTranslation } from '@/hooks/use-translation'

interface Employee {
  id: string
  name: string
}

interface WecomSetupWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: {
    name: string
    type: string
    config: ConnectionConfig
  }) => Promise<{ success: boolean; data?: { webhookUrl?: string } }>
  initialData?: {
    id: string
    name: string
    config: Record<string, unknown>
  }
}

export function WecomSetupWizard({
  open,
  onOpenChange,
  onSubmit,
  initialData,
}: WecomSetupWizardProps) {
  const { t } = useTranslation()
  const wizardSteps = useMemo(
    () => [
      { title: t('channels.wecomStepBasic'), description: t('channels.wecomStepBasicDesc') },
      { title: t('channels.wecomStepCred'), description: t('channels.wecomStepCredDesc') },
      { title: t('channels.wecomStepCallback'), description: t('channels.wecomStepCallbackDesc') },
      { title: t('channels.wecomStepDone'), description: t('channels.wecomStepDoneDesc') },
    ],
    [t]
  )
  const [step, setStep] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])

  // Form fields
  const [name, setName] = useState('')
  const [boundEmployeeId, setBoundEmployeeId] = useState('')
  const [corpId, setCorpId] = useState('')
  const [corpSecret, setCorpSecret] = useState('')
  const [agentId, setAgentId] = useState('')
  const [token, setToken] = useState('')
  const [encodingAESKey, setEncodingAESKey] = useState('')

  useEffect(() => {
    if (open) {
      setStep(0)
      setWebhookUrl('')
      setCopied(false)

      if (initialData) {
        setName(initialData.name)
        const cfg = initialData.config
        setBoundEmployeeId((cfg.boundEmployeeId as string) ?? '')
        setCorpId((cfg.corpId as string) ?? '')
        setCorpSecret('')
        setAgentId((cfg.agentId as string) ?? '')
        setToken('')
        setEncodingAESKey('')
      } else {
        setName('')
        setBoundEmployeeId('')
        setCorpId('')
        setCorpSecret('')
        setAgentId('')
        setToken('')
        setEncodingAESKey('')
      }

      // Fetch employees for binding
      fetch('/api/employee/employees?status=active')
        .then((res) => res.json())
        .then((json) => {
          if (json.success) {
            setEmployees(
              (json.data ?? []).map((e: { id: string; name: string }) => ({
                id: e.id,
                name: e.name,
              }))
            )
          }
        })
        .catch(() => {})
    }
  }, [open, initialData])

  const canProceed = useCallback(() => {
    switch (step) {
      case 0:
        return name.trim().length > 0
      case 1:
        return corpId.trim().length > 0 && corpSecret.trim().length > 0 && agentId.trim().length > 0
      case 2:
        return token.trim().length > 0 && encodingAESKey.trim().length > 0
      default:
        return true
    }
  }, [step, name, corpId, corpSecret, agentId, token, encodingAESKey])

  const handleNext = async () => {
    if (step < 2) {
      setStep(step + 1)
      return
    }

    if (step === 2) {
      setIsSubmitting(true)
      try {
        const config: ConnectionConfig = {
          corpId,
          corpSecret,
          agentId,
          token,
          encodingAESKey,
          boundEmployeeId: boundEmployeeId || undefined,
        }

        const result = await onSubmit({ name, type: 'wecom', config })
        if (result.success) {
          setWebhookUrl(result.data?.webhookUrl ?? '')
          setStep(3)
        }
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  const handleCopyWebhook = async () => {
    await copyToClipboard(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-lg' data-testid='wecom-wizard:dialog'>
        <DialogHeader>
          <DialogTitle>
            {initialData ? t('channels.wecomEditTitle') : t('channels.wecomAddTitle')}
          </DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className='mb-4 flex items-center gap-2'>
          {wizardSteps.map((s, i) => (
            <div key={i} className='flex items-center gap-1' data-testid={`wecom-wizard:step:${i}`}>
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full font-medium text-xs ${
                  i < step
                    ? 'bg-green-500 text-white'
                    : i === step
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-500'
                }`}
              >
                {i < step ? <Check className='h-3 w-3' /> : i + 1}
              </div>
              <span
                className={`hidden text-xs sm:inline ${i === step ? 'font-medium text-gray-900' : 'text-gray-400'}`}
              >
                {s.title}
              </span>
              {i < wizardSteps.length - 1 && <div className='mx-1 h-px w-4 bg-gray-200' />}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className='min-h-[200px]'>
          {step === 0 && (
            <div className='space-y-4'>
              <div>
                <Label htmlFor='channel-name'>{t('channels.wecomChannelName')}</Label>
                <Input
                  id='channel-name'
                  data-testid='wecom-wizard:input:name'
                  placeholder={t('channels.wecomNamePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor='bind-employee'>{t('channels.wecomBindEmployee')}</Label>
                <Select value={boundEmployeeId} onValueChange={setBoundEmployeeId}>
                  <SelectTrigger id='bind-employee' data-testid='wecom-wizard:input:employee'>
                    <SelectValue placeholder={t('channels.wecomSelectEmployee')} />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className='space-y-4'>
              <div>
                <Label htmlFor='corp-id'>{t('channels.wecomCorpId')}</Label>
                <Input
                  id='corp-id'
                  data-testid='wecom-wizard:input:corpId'
                  placeholder={t('channels.wecomCorpIdPlaceholder')}
                  value={corpId}
                  onChange={(e) => setCorpId(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor='corp-secret'>{t('channels.wecomCorpSecret')}</Label>
                <Input
                  id='corp-secret'
                  type='password'
                  data-testid='wecom-wizard:input:corpSecret'
                  placeholder={t('channels.wecomCorpSecretPlaceholder')}
                  value={corpSecret}
                  onChange={(e) => setCorpSecret(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor='agent-id'>{t('channels.wecomAgentId')}</Label>
                <Input
                  id='agent-id'
                  data-testid='wecom-wizard:input:agentId'
                  placeholder={t('channels.wecomAgentIdPlaceholder')}
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className='space-y-4'>
              <div>
                <Label htmlFor='callback-token'>{t('channels.wecomCallbackToken')}</Label>
                <Input
                  id='callback-token'
                  type='password'
                  data-testid='wecom-wizard:input:token'
                  placeholder={t('channels.wecomCallbackTokenPlaceholder')}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor='encoding-aes-key'>EncodingAESKey</Label>
                <Input
                  id='encoding-aes-key'
                  type='password'
                  data-testid='wecom-wizard:input:encodingAESKey'
                  placeholder={t('channels.wecomEncodingAESKeyPlaceholder')}
                  value={encodingAESKey}
                  onChange={(e) => setEncodingAESKey(e.target.value)}
                />
                <p className='mt-1 text-gray-500 text-xs'>
                  {t('channels.wecomEncodingAESKeyHint')}
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className='space-y-4'>
              <div className='rounded-lg border border-green-200 bg-green-50 p-4'>
                <div className='flex items-center gap-2'>
                  <Check className='h-5 w-5 text-green-600' />
                  <span className='font-medium text-green-800'>{t('channels.wecomSuccess')}</span>
                </div>
                <p className='mt-1 text-green-700 text-sm'>{t('channels.wecomWebhookHint')}</p>
              </div>

              {webhookUrl && (
                <div>
                  <Label>Webhook URL</Label>
                  <div className='mt-1 flex items-center gap-2'>
                    <code
                      className='flex-1 rounded border bg-gray-50 px-3 py-2 text-gray-700 text-sm'
                      data-testid='wecom-wizard:webhook-url'
                    >
                      {webhookUrl}
                    </code>
                    <Button
                      variant='outline'
                      size='sm'
                      data-testid='wecom-wizard:copy-url'
                      onClick={handleCopyWebhook}
                    >
                      {copied ? (
                        <Check className='h-4 w-4 text-green-500' />
                      ) : (
                        <Copy className='h-4 w-4' />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className='flex justify-between border-t pt-4'>
          {step > 0 && step < 3 ? (
            <Button
              variant='outline'
              onClick={() => setStep(step - 1)}
              data-testid='wecom-wizard:back'
            >
              <ChevronLeft className='mr-1 h-4 w-4' />
              {t('common.previous')}
            </Button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <Button
              onClick={handleNext}
              disabled={!canProceed() || isSubmitting}
              data-testid='wecom-wizard:next'
            >
              {isSubmitting ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
              {step === 2 ? t('channels.wecomCreateChannel') : t('common.next')}
              {step < 2 && <ChevronRight className='ml-1 h-4 w-4' />}
            </Button>
          ) : (
            <Button onClick={() => onOpenChange(false)} data-testid='wecom-wizard:submit'>
              {t('channels.wecomDone')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

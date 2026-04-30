'use client'

import { useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { useTranslation } from '@/hooks/use-translation'
import { useSandboxStore } from '@/stores/sandbox'
import { DEFAULT_EXTERNAL_CALL_POLICY, type ExternalCallPolicy } from '@/types/sandbox'

interface SandboxRunDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sopDefinitionId?: string
  runType?: string
}

const POLICY_KEYS: Array<{ key: keyof ExternalCallPolicy; labelKey: string; descKey: string }> = [
  { key: 'llm', labelKey: 'sandbox.policyLlm', descKey: 'sandbox.policyLlmDesc' },
  { key: 'sql', labelKey: 'sandbox.policySql', descKey: 'sandbox.policySqlDesc' },
  { key: 'http', labelKey: 'sandbox.policyHttp', descKey: 'sandbox.policyHttpDesc' },
  { key: 'email', labelKey: 'sandbox.policyEmail', descKey: 'sandbox.policyEmailDesc' },
  { key: 'push', labelKey: 'sandbox.policyPush', descKey: 'sandbox.policyPushDesc' },
]

export function SandboxRunDialog({ open, onOpenChange, sopDefinitionId }: SandboxRunDialogProps) {
  const { t } = useTranslation()
  const startSandbox = useSandboxStore((s) => s.startSandbox)
  const [triggerDataText, setTriggerDataText] = useState('{}')
  const [policy, setPolicy] = useState<ExternalCallPolicy>(DEFAULT_EXTERNAL_CALL_POLICY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleStart = async () => {
    if (!sopDefinitionId) {
      setError(t('sandbox.startFailed'))
      return
    }

    let triggerData: Record<string, unknown> = {}
    const trimmed = triggerDataText.trim()
    if (trimmed) {
      try {
        triggerData = JSON.parse(trimmed)
      } catch {
        setError(t('sandbox.triggerJsonError'))
        return
      }
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/sandbox/sop-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sop_definition_id: sopDefinitionId,
          trigger_data: triggerData,
          policy,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.message ? t(json.message) : t('sandbox.startFailed'))
        return
      }
      const runId = json.data?.runId
      if (typeof runId !== 'string') {
        setError(t('sandbox.startFailed'))
        return
      }
      startSandbox(runId)
      onOpenChange(false)
    } catch {
      setError(t('sandbox.networkError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <FlaskConical className='h-5 w-5 text-amber-500' />
            {t('sandbox.dialogTitle')}
          </DialogTitle>
          <DialogDescription>{t('sandbox.dialogDesc')}</DialogDescription>
        </DialogHeader>

        <div className='space-y-5'>
          <div>
            <label
              htmlFor='sandbox-trigger-data'
              className='mb-1 block font-medium text-gray-700 text-sm'
            >
              {t('sandbox.triggerDataLabel')}
            </label>
            <textarea
              id='sandbox-trigger-data'
              value={triggerDataText}
              onChange={(e) => setTriggerDataText(e.target.value)}
              rows={5}
              className='w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-gray-700 text-xs placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
              placeholder='{"key": "value"}'
            />
          </div>

          <div>
            <p className='mb-2 font-medium text-gray-700 text-sm'>{t('sandbox.policyLabel')}</p>
            <div className='space-y-2 rounded-lg border border-gray-200 p-3'>
              {POLICY_KEYS.map(({ key, labelKey, descKey }) => (
                <div key={key} className='flex items-start justify-between gap-3'>
                  <div>
                    <p className='font-medium text-gray-800 text-sm'>{t(labelKey)}</p>
                    <p className='text-gray-500 text-xs'>{t(descKey)}</p>
                  </div>
                  <Switch
                    checked={policy[key]}
                    onCheckedChange={(checked) =>
                      setPolicy((prev) => ({ ...prev, [key]: checked }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          {error && <p className='rounded-lg bg-red-50 px-3 py-2 text-red-600 text-sm'>{error}</p>}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('sandbox.dialogCancel')}
          </Button>
          <Button
            onClick={handleStart}
            disabled={submitting || !sopDefinitionId}
            className='bg-amber-500 hover:bg-amber-600'
          >
            {submitting ? t('sandbox.dialogStarting') : t('sandbox.dialogStart')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

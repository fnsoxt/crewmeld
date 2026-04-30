'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/hooks/use-translation'

interface PersonaEditorProps {
  employeeId: string
}

const TEMPLATE_KEYS = ['customer_service', 'data_analyst', 'sales_assistant', 'general'] as const

const TEMPLATE_I18N_MAP: Record<string, { label: string; content: string }> = {
  customer_service: {
    label: 'persona.templateCustomerService',
    content: 'persona.tplCustomerService',
  },
  data_analyst: { label: 'persona.templateDataAnalyst', content: 'persona.tplDataAnalyst' },
  sales_assistant: {
    label: 'persona.templateSalesAssistant',
    content: 'persona.tplSalesAssistant',
  },
  general: { label: 'persona.templateGeneral', content: 'persona.tplGeneral' },
}

export function PersonaEditor({ employeeId }: PersonaEditorProps) {
  const { t } = useTranslation()
  const [persona, setPersona] = useState('')
  const [originalPersona, setOriginalPersona] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    fetch(`/api/employee/employees/${employeeId}`)
      .then((res) => res.json())
      .then((json) => {
        const p = json.data?.persona ?? ''
        setPersona(p)
        setOriginalPersona(p)
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [employeeId])

  const estimatedTokens = Math.ceil(persona.length * 1.5)
  const isOverBudget = estimatedTokens > 1000
  const hasChanges = persona !== originalPersona

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    setSaveSuccess(false)
    try {
      const res = await fetch(`/api/employee/employees/${employeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona: persona || null }),
      })
      if (res.ok) {
        setOriginalPersona(persona)
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 2000)
      }
    } finally {
      setIsSaving(false)
    }
  }, [employeeId, persona])

  const handleTemplate = useCallback(
    (key: string) => {
      const mapping = TEMPLATE_I18N_MAP[key]
      if (mapping) setPersona(t(mapping.content))
    },
    [t]
  )

  if (isLoading) {
    return (
      <div className='flex items-center justify-center py-12'>
        <Loader2 className='h-6 w-6 animate-spin text-gray-400' />
      </div>
    )
  }

  return (
    <div className='space-y-4'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h3 className='font-medium text-base text-gray-900'>{t('persona.title')}</h3>
          <p className='mt-0.5 text-gray-500 text-xs'>{t('persona.subtitle')}</p>
        </div>
        <div className='flex items-center gap-2'>
          <Button variant='outline' size='sm' onClick={() => setShowPreview(!showPreview)}>
            {showPreview ? t('persona.edit') : t('persona.preview')}
          </Button>
          <Button
            data-testid='persona:save'
            size='sm'
            disabled={!hasChanges || isSaving}
            onClick={handleSave}
          >
            {isSaving ? (
              <Loader2 className='mr-1 h-3 w-3 animate-spin' />
            ) : saveSuccess ? (
              <Check className='mr-1 h-3 w-3' />
            ) : null}
            {saveSuccess ? t('persona.saved') : t('persona.save')}
          </Button>
        </div>
      </div>

      {/* Template selector */}
      <div className='flex flex-wrap gap-2'>
        <span className='text-gray-500 text-xs leading-7'>{t('persona.templateLabel')}</span>
        {TEMPLATE_KEYS.map((key) => (
          <Button
            key={key}
            data-testid={`persona:template:${key}`}
            variant='outline'
            size='sm'
            className='h-7 text-xs'
            onClick={() => handleTemplate(key)}
          >
            {t(TEMPLATE_I18N_MAP[key].label)}
          </Button>
        ))}
      </div>

      {/* Editor / Preview */}
      <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
        {/* Textarea */}
        {!showPreview && (
          <div>
            <textarea
              data-testid='persona:editor'
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder={t('persona.placeholder')}
              rows={16}
              className='w-full rounded-lg border border-gray-300 px-4 py-3 font-mono text-sm leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
            />
            <div className='mt-2 flex items-center justify-between text-xs'>
              <span className={isOverBudget ? 'text-yellow-600' : 'text-gray-400'}>
                {t('persona.estimatedTokens', { count: estimatedTokens })}
                {isOverBudget && t('persona.tokenOverBudget')}
              </span>
              <span className='text-gray-400'>
                {t('persona.charCount', { count: persona.length })}
              </span>
            </div>
          </div>
        )}

        {/* Preview */}
        {(showPreview || !showPreview) && (
          <div className={showPreview ? 'col-span-full' : ''}>
            <div className='min-h-[400px] rounded-lg border border-gray-200 bg-white p-4'>
              <div className='prose prose-sm max-w-none'>
                {persona ? (
                  <ReactMarkdown>{persona}</ReactMarkdown>
                ) : (
                  <p className='text-gray-400'>{t('persona.emptyPreview')}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useCallback, useState } from 'react'
import { Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useTranslation } from '@/hooks/use-translation'
import { AdminAccountStep } from './admin-account-step'
import { OrgConfigStep } from './org-config-step'
import { SystemCheckStep } from './system-check-step'

const STEP_KEYS = ['setup.stepAdmin', 'setup.stepOrg', 'setup.stepCheck'] as const
const TOTAL_STEPS = STEP_KEYS.length

interface FormData {
  adminEmail: string
  adminPassword: string
  confirmPassword: string
  adminName: string
  orgName: string
}

const INITIAL_FORM: FormData = {
  adminEmail: '',
  adminPassword: '',
  confirmPassword: '',
  adminName: '',
  orgName: '',
}

export function SetupWizard() {
  const { t } = useTranslation()
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const validateStep0 = useCallback((): boolean => {
    const newErrors: Record<string, string> = {}
    if (!formData.adminName.trim()) newErrors.adminName = t('setup.adminErrorName')
    if (!formData.adminEmail.trim()) {
      newErrors.adminEmail = t('setup.adminErrorEmail')
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.adminEmail)) {
      newErrors.adminEmail = t('setup.adminErrorEmailInvalid')
    }
    if (!formData.adminPassword) {
      newErrors.adminPassword = t('setup.adminErrorPassword')
    } else if (formData.adminPassword.length < 8) {
      newErrors.adminPassword = t('setup.adminErrorPasswordLength')
    }
    if (formData.adminPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = t('setup.adminErrorConfirm')
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData])

  const handleNext = useCallback(() => {
    if (step === 0 && !validateStep0()) return
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))
  }, [step, validateStep0])

  const handlePrev = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0))
  }, [])

  const handleSubmit = useCallback(async () => {
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch('/api/system/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail: formData.adminEmail,
          adminPassword: formData.adminPassword,
          adminName: formData.adminName,
          orgName: formData.orgName || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `${t('setup.initError')} (${res.status})`)
      }
      router.push('/login')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('setup.initError'))
    } finally {
      setSubmitting(false)
    }
  }, [formData, router])

  return (
    <Card>
      <CardContent className='p-6'>
        <div className='mb-6 text-center'>
          <h1 className='font-bold text-gray-900 text-xl'>{t('setup.title')}</h1>
          <p className='mt-1 text-gray-500 text-sm'>{t('setup.subtitle')}</p>
        </div>

        <div
          className='mb-6 flex items-center justify-center gap-2'
          data-testid='setup-form:step-indicator'
        >
          {STEP_KEYS.map((tKey, i) => (
            <div key={tKey} className='flex items-center gap-2'>
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full font-medium text-xs ${
                  i < step
                    ? 'bg-green-500 text-white'
                    : i === step
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-500'
                }`}
              >
                {i < step ? <Check className='h-4 w-4' /> : i + 1}
              </div>
              <span
                className={`hidden text-xs sm:inline ${
                  i === step ? 'font-medium text-gray-900' : 'text-gray-400'
                }`}
              >
                {t(tKey)}
              </span>
              {i < TOTAL_STEPS - 1 && (
                <div className={`h-px w-6 ${i < step ? 'bg-green-500' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        {step === 0 && (
          <AdminAccountStep
            data={formData}
            onChange={(d) => {
              setFormData((prev) => ({ ...prev, ...d }))
              setErrors({})
            }}
            errors={errors}
          />
        )}

        {step === 1 && (
          <OrgConfigStep
            data={{ orgName: formData.orgName }}
            onChange={(d) => setFormData((prev) => ({ ...prev, ...d }))}
          />
        )}

        {step === 2 && <SystemCheckStep />}

        {submitError && (
          <div className='mt-4 rounded-md bg-red-50 p-3 text-red-700 text-sm'>{submitError}</div>
        )}

        <div className='mt-6 flex justify-between'>
          <Button
            variant='outline'
            onClick={handlePrev}
            disabled={step === 0 || submitting}
            data-testid='setup-form:prev'
          >
            {t('common.previous')}
          </Button>

          {step < TOTAL_STEPS - 1 ? (
            <Button onClick={handleNext} data-testid='setup-form:next'>
              {t('common.next')}
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting} data-testid='setup-form:submit'>
              {submitting ? t('setup.initializing') : t('setup.finish')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

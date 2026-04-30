'use client'

import { useState } from 'react'
import { useTranslation } from '@/hooks/use-translation'
import type { LicenseStatus } from '../types'

interface LicenseUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

type DialogStep = 'input' | 'validating' | 'validated' | 'applying' | 'error'

export function LicenseUploadDialog({ open, onOpenChange, onSuccess }: LicenseUploadDialogProps) {
  const { t } = useTranslation()
  const STATUS_LABEL: Record<string, string> = {
    active: t('settings.licenseActive'),
    expiring_soon: t('settings.licenseExpiringSoon'),
    expired: t('settings.licenseExpired'),
    invalid_signature: t('settings.licenseInvalidSignature'),
    community: t('settings.editionCommunity'),
  }
  const EDITION_LABEL: Record<string, string> = {
    community: t('settings.editionCommunity'),
    standard: t('settings.editionStandard'),
    enterprise: t('settings.editionEnterprise'),
  }
  const [content, setContent] = useState('')
  const [step, setStep] = useState<DialogStep>('input')
  const [validationResult, setValidationResult] = useState<LicenseStatus | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  function reset() {
    setContent('')
    setStep('input')
    setValidationResult(null)
    setErrorMessage('')
  }

  function handleClose() {
    reset()
    onOpenChange(false)
  }

  async function handleValidate() {
    setStep('validating')
    setErrorMessage('')
    try {
      const res = await fetch('/api/employee/license/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseContent: content.trim() }),
      })
      const json = await res.json()
      if (!json.success) {
        setErrorMessage(json.error ?? t('settings.licenseValidationFailed'))
        setStep('error')
        return
      }
      setValidationResult(json.data as LicenseStatus)
      setStep('validated')
    } catch {
      setErrorMessage(t('settings.licenseNetworkFailed'))
      setStep('error')
    }
  }

  async function handleApply() {
    setStep('applying')
    setErrorMessage('')
    try {
      const res = await fetch('/api/employee/license/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseContent: content.trim() }),
      })
      const json = await res.json()
      if (!json.success) {
        setErrorMessage(json.error ?? t('settings.licenseApplyFailed'))
        setStep('error')
        return
      }
      handleClose()
      onSuccess()
    } catch {
      setErrorMessage(t('settings.licenseNetworkFailed'))
      setStep('error')
    }
  }

  if (!open) return null

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
      <div className='w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl'>
        <div className='flex items-center justify-between border-gray-200 border-b px-6 py-4'>
          <h2 className='font-semibold text-gray-900 text-lg'>
            {t('settings.licenseUploadTitle')}
          </h2>
          <button
            onClick={handleClose}
            className='rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          >
            <svg className='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M6 18L18 6M6 6l12 12'
              />
            </svg>
          </button>
        </div>

        <div className='px-6 py-4'>
          <label
            htmlFor='license-upload-content'
            className='mb-2 block font-medium text-gray-700 text-sm'
          >
            {t('settings.licenseContentLabel')}
          </label>
          <textarea
            id='license-upload-content'
            data-testid='dialog:license-upload:textarea'
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              if (step !== 'input') setStep('input')
            }}
            rows={8}
            className='w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-gray-900 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
            placeholder='{"customer_name":"...","max_employees":...,"expires_at":"...","edition":"...","features":[...],"signature":"..."}'
          />

          {step === 'validated' && validationResult && (
            <div className='mt-4 rounded-lg border border-green-200 bg-green-50 p-4'>
              <div className='mb-2 flex items-center gap-2'>
                <span
                  className={`rounded-full px-2 py-0.5 font-medium text-xs ${
                    validationResult.valid
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {STATUS_LABEL[validationResult.status] ?? validationResult.status}
                </span>
                <span className='font-medium text-gray-900 text-sm'>
                  {EDITION_LABEL[validationResult.edition] ?? validationResult.edition}
                </span>
              </div>
              <dl className='grid grid-cols-2 gap-x-4 gap-y-1 text-sm'>
                {validationResult.customerName && (
                  <>
                    <dt className='text-gray-500'>{t('settings.licenseCustomer')}</dt>
                    <dd className='text-gray-900'>{validationResult.customerName}</dd>
                  </>
                )}
                <dt className='text-gray-500'>{t('settings.licenseQuota')}</dt>
                <dd className='text-gray-900'>
                  {validationResult.maxEmployees === -1
                    ? t('settings.licenseUnlimited')
                    : validationResult.maxEmployees}
                </dd>
                {validationResult.expiresAt && (
                  <>
                    <dt className='text-gray-500'>{t('settings.licenseExpireAt')}</dt>
                    <dd className='text-gray-900'>{validationResult.expiresAt}</dd>
                  </>
                )}
                {(validationResult.features ?? []).length > 0 && (
                  <>
                    <dt className='text-gray-500'>{t('settings.licenseFeatures')}</dt>
                    <dd className='text-gray-900'>
                      {(validationResult.features ?? []).join(', ')}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          )}

          {(step === 'error' || errorMessage) && (
            <div className='mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-600 text-sm'>
              {errorMessage}
            </div>
          )}
        </div>

        <div className='flex justify-end gap-3 border-gray-200 border-t px-6 py-4'>
          <button
            onClick={handleClose}
            className='rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 text-sm hover:bg-gray-50'
          >
            {t('common.cancel')}
          </button>

          {step === 'validated' || step === 'applying' ? (
            <button
              data-testid='dialog:license-upload:apply'
              onClick={handleApply}
              disabled={!validationResult?.valid || step === 'applying'}
              className='rounded-lg bg-green-600 px-4 py-2 font-medium text-sm text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50'
            >
              {step === 'applying' ? t('settings.licenseApplying') : t('settings.licenseApply')}
            </button>
          ) : (
            <button
              data-testid='dialog:license-upload:validate'
              onClick={handleValidate}
              disabled={!content.trim() || step === 'validating'}
              className='rounded-lg bg-blue-600 px-4 py-2 font-medium text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
            >
              {step === 'validating'
                ? t('settings.licenseValidating')
                : t('settings.licenseValidate')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

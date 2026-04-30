'use client'

import { useCallback, useEffect, useState } from 'react'
import { createLogger } from '@crewmeld/logger'
import { useTranslation } from '@/hooks/use-translation'

const logger = createLogger('RegistrationSettingsPanel')

interface RegistrationSettings {
  registrationDisabled: boolean
  approvalRequired: boolean
  allowedEmails: string
  allowedDomains: string
}

export function RegistrationSettingsPanel() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<RegistrationSettings>({
    registrationDisabled: false,
    approvalRequired: false,
    allowedEmails: '',
    allowedDomains: '',
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const fetchSettings = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch('/api/employee/settings/registration')
      const data = await res.json()
      if (data.success) {
        setSettings(data.data)
      } else {
        setError(data.error ?? t('settings.registrationFetchFailed'))
      }
    } catch (err) {
      logger.error('Failed to load registration settings', { error: err })
      setError(t('settings.registrationFetchFailed'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const handleSave = async () => {
    try {
      setIsSaving(true)
      setSaveMessage(null)
      const res = await fetch('/api/employee/settings/registration', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const data = await res.json()
      if (data.success) {
        setSaveMessage(t('settings.registrationSaved'))
        setTimeout(() => setSaveMessage(null), 3000)
      } else {
        setSaveMessage(data.error ?? t('settings.registrationSaveFailed'))
        setTimeout(() => setSaveMessage(null), 3000)
      }
    } catch (err) {
      logger.error('Failed to save registration settings', { error: err })
      setSaveMessage(t('settings.registrationSaveFailed'))
      setTimeout(() => setSaveMessage(null), 3000)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className='space-y-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className='animate-pulse rounded-xl border border-gray-200 bg-white p-5'>
            <div className='h-5 w-1/3 rounded bg-gray-200' />
            <div className='mt-3 h-4 w-2/3 rounded bg-gray-100' />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className='flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 py-12'>
        <p className='text-red-600 text-sm'>{error}</p>
        <button
          onClick={fetchSettings}
          className='rounded-lg bg-gray-600 px-4 py-2 font-medium text-sm text-white hover:bg-gray-700'
        >
          {t('common.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className='space-y-6'>
      <div className='space-y-6 rounded-xl border border-gray-200 bg-white p-6'>
        <div className='flex items-center justify-between'>
          <div>
            <h3 className='font-medium text-gray-900 text-sm'>
              {t('settings.registrationCloseTitle')}
            </h3>
            <p className='mt-1 text-gray-500 text-xs'>{t('settings.registrationCloseDesc')}</p>
          </div>
          <button
            type='button'
            role='switch'
            aria-checked={settings.registrationDisabled}
            onClick={() =>
              setSettings((prev) => ({ ...prev, registrationDisabled: !prev.registrationDisabled }))
            }
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              settings.registrationDisabled ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                settings.registrationDisabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div
          className={`border-gray-100 border-t pt-6 transition-opacity ${settings.registrationDisabled ? 'pointer-events-none opacity-40' : ''}`}
        >
          <div className='flex items-center justify-between'>
            <div>
              <h3 className='font-medium text-gray-900 text-sm'>
                {t('settings.registrationApprovalTitle')}
              </h3>
              <p className='mt-1 text-gray-500 text-xs'>{t('settings.registrationApprovalDesc')}</p>
            </div>
            <button
              type='button'
              role='switch'
              aria-checked={settings.approvalRequired}
              disabled={settings.registrationDisabled}
              onClick={() =>
                setSettings((prev) => ({ ...prev, approvalRequired: !prev.approvalRequired }))
              }
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                settings.approvalRequired ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                  settings.approvalRequired ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <div
          className={`border-gray-100 border-t pt-6 transition-opacity ${settings.registrationDisabled ? 'pointer-events-none opacity-40' : ''}`}
        >
          <h3 className='font-medium text-gray-900 text-sm'>
            {t('settings.registrationEmailWhitelist')}
          </h3>
          <p className='mt-1 mb-2 text-gray-500 text-xs'>
            {t('settings.registrationEmailWhitelistDesc')}
          </p>
          <textarea
            value={settings.allowedEmails}
            disabled={settings.registrationDisabled}
            onChange={(e) => setSettings((prev) => ({ ...prev, allowedEmails: e.target.value }))}
            placeholder='user1@example.com, user2@example.com'
            rows={3}
            className='w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50'
          />
        </div>

        <div
          className={`border-gray-100 border-t pt-6 transition-opacity ${settings.registrationDisabled ? 'pointer-events-none opacity-40' : ''}`}
        >
          <h3 className='font-medium text-gray-900 text-sm'>
            {t('settings.registrationDomainWhitelist')}
          </h3>
          <p className='mt-1 mb-2 text-gray-500 text-xs'>
            {t('settings.registrationDomainWhitelistDesc')}
          </p>
          <textarea
            value={settings.allowedDomains}
            disabled={settings.registrationDisabled}
            onChange={(e) => setSettings((prev) => ({ ...prev, allowedDomains: e.target.value }))}
            placeholder='example.com, company.cn'
            rows={3}
            className='w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50'
          />
        </div>
      </div>

      <div className='flex items-center gap-3'>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className='rounded-lg bg-blue-600 px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-blue-700 disabled:opacity-50'
        >
          {isSaving ? t('settings.registrationSaving') : t('settings.registrationSaveBtn')}
        </button>
      </div>

      {/* Floating toast notification */}
      {saveMessage && (
        <div
          className={`-translate-x-1/2 fixed top-16 left-1/2 z-50 rounded-xl border px-5 py-3 shadow-lg ${
            saveMessage === t('settings.registrationSaved')
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          <span className='font-medium text-sm'>{saveMessage}</span>
        </div>
      )}
    </div>
  )
}

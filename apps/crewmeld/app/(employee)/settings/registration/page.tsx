'use client'

import { useTranslation } from '@/hooks/use-translation'
import { SettingsTabs } from '../settings-tabs'
import { RegistrationSettingsPanel } from '../users/components/registration-settings-panel'

export default function RegistrationSettingsPage() {
  const { t } = useTranslation()

  return (
    <div>
      <div className='mb-6'>
        <h1 className='font-bold text-2xl text-gray-900'>{t('settings.title')}</h1>
        <p className='mt-1 text-gray-500 text-sm'>{t('settings.registrationSubtitle')}</p>
      </div>

      <SettingsTabs />

      <RegistrationSettingsPanel />
    </div>
  )
}

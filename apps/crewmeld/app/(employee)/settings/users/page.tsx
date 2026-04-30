'use client'

import { useTranslation } from '@/hooks/use-translation'
import { SettingsTabs } from '../settings-tabs'
import { UserTable } from './components/user-table'

export default function UserManagementPage() {
  const { t } = useTranslation()

  return (
    <div>
      <div className='mb-6'>
        <h1 className='font-bold text-2xl text-gray-900'>{t('settings.title')}</h1>
        <p className='mt-1 text-gray-500 text-sm'>{t('settings.subtitleUsers')}</p>
      </div>

      <SettingsTabs />

      <UserTable />
    </div>
  )
}

'use client'

import { useTranslation } from '@/hooks/use-translation'
import { SettingsTabs } from '../settings-tabs'
import { PermissionMatrix } from './components/permission-matrix'
import { useRolePermissions } from './hooks/use-role-permissions'

export default function RolesPage() {
  const { t } = useTranslation()
  const { data, isLoading, error, refetch } = useRolePermissions()

  return (
    <div>
      <div className='mb-6'>
        <h1 className='font-bold text-2xl text-gray-900'>{t('settings.title')}</h1>
        <p className='mt-1 text-gray-500 text-sm'>{t('settings.rolesSubtitle')}</p>
      </div>

      <SettingsTabs />

      {isLoading && (
        <div className='space-y-4'>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className='h-48 animate-pulse rounded-xl border border-gray-200 bg-gray-50'
            />
          ))}
        </div>
      )}

      {error && (
        <div className='flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 py-12'>
          <p className='text-red-600 text-sm'>{error}</p>
          <button
            onClick={refetch}
            className='rounded-lg bg-gray-600 px-4 py-2 font-medium text-sm text-white hover:bg-gray-700'
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {data && (
        <PermissionMatrix
          permissions={data.permissions}
          rolePermissions={data.rolePermissions}
          onSaved={refetch}
        />
      )}
    </div>
  )
}

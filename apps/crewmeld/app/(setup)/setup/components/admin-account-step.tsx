'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/hooks/use-translation'

interface AdminAccountData {
  adminEmail: string
  adminPassword: string
  confirmPassword: string
  adminName: string
}

interface AdminAccountStepProps {
  data: AdminAccountData
  onChange: (data: AdminAccountData) => void
  errors: Record<string, string>
}

export function AdminAccountStep({ data, onChange, errors }: AdminAccountStepProps) {
  const { t } = useTranslation()
  const update = (field: keyof AdminAccountData, value: string) => {
    onChange({ ...data, [field]: value })
  }

  return (
    <div className='space-y-4'>
      <div>
        <h2 className='font-semibold text-gray-900 text-lg'>{t('setup.adminTitle')}</h2>
        <p className='mt-1 text-gray-500 text-sm'>{t('setup.adminSubtitle')}</p>
      </div>

      <div className='space-y-3'>
        <div>
          <Label htmlFor='setup-admin-name'>{t('setup.adminName')}</Label>
          <Input
            id='setup-admin-name'
            data-testid='setup-form:input:admin-name'
            value={data.adminName}
            onChange={(e) => update('adminName', e.target.value)}
            placeholder={t('setup.adminNamePlaceholder')}
          />
          {errors.adminName && <p className='mt-1 text-red-500 text-xs'>{errors.adminName}</p>}
        </div>

        <div>
          <Label htmlFor='setup-admin-email'>{t('setup.adminEmail')}</Label>
          <Input
            id='setup-admin-email'
            type='email'
            data-testid='setup-form:input:admin-email'
            value={data.adminEmail}
            onChange={(e) => update('adminEmail', e.target.value)}
            placeholder='admin@example.com'
          />
          {errors.adminEmail && <p className='mt-1 text-red-500 text-xs'>{errors.adminEmail}</p>}
        </div>

        <div>
          <Label htmlFor='setup-admin-password'>{t('setup.adminPassword')}</Label>
          <Input
            id='setup-admin-password'
            type='password'
            data-testid='setup-form:input:admin-password'
            value={data.adminPassword}
            onChange={(e) => update('adminPassword', e.target.value)}
            placeholder={t('setup.adminPasswordPlaceholder')}
          />
          {errors.adminPassword && (
            <p className='mt-1 text-red-500 text-xs'>{errors.adminPassword}</p>
          )}
        </div>

        <div>
          <Label htmlFor='setup-confirm-password'>{t('setup.adminConfirmPassword')}</Label>
          <Input
            id='setup-confirm-password'
            type='password'
            data-testid='setup-form:input:confirm-password'
            value={data.confirmPassword}
            onChange={(e) => update('confirmPassword', e.target.value)}
            placeholder={t('setup.adminConfirmPlaceholder')}
          />
          {errors.confirmPassword && (
            <p className='mt-1 text-red-500 text-xs'>{errors.confirmPassword}</p>
          )}
        </div>
      </div>
    </div>
  )
}

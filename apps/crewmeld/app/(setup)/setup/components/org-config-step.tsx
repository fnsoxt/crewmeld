'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/hooks/use-translation'

interface OrgConfigData {
  orgName: string
}

interface OrgConfigStepProps {
  data: OrgConfigData
  onChange: (data: OrgConfigData) => void
}

export function OrgConfigStep({ data, onChange }: OrgConfigStepProps) {
  const { t } = useTranslation()
  return (
    <div className='space-y-4'>
      <div>
        <h2 className='font-semibold text-gray-900 text-lg'>{t('setup.orgTitle')}</h2>
        <p className='mt-1 text-gray-500 text-sm'>{t('setup.orgSubtitle')}</p>
      </div>

      <div>
        <Label htmlFor='setup-org-name'>{t('setup.orgName')}</Label>
        <Input
          id='setup-org-name'
          data-testid='setup-form:input:org-name'
          value={data.orgName}
          onChange={(e) => onChange({ orgName: e.target.value })}
          placeholder={t('setup.orgNamePlaceholder')}
        />
        <p className='mt-1 text-gray-400 text-xs'>{t('setup.orgHint')}</p>
      </div>
    </div>
  )
}

'use client'

import { Check, Shield, Users, X } from 'lucide-react'
import type { LicenseFeature } from '@/lib/license/types'
import { useTranslation } from '@/hooks/use-translation'
import type { LicenseStatus } from '../types'

interface LicenseCardProps {
  data: LicenseStatus
  onRefresh?: () => void
}

export function LicenseCard({ data, onRefresh }: LicenseCardProps) {
  const { t } = useTranslation()

  const STATUS_CONFIG: Record<LicenseStatus['status'], { text: string; className: string }> = {
    active: { text: t('settings.licenseActive'), className: 'bg-green-100 text-green-700' },
    expiring_soon: {
      text: t('settings.licenseExpiringSoon'),
      className: 'bg-yellow-100 text-yellow-700',
    },
    expired: { text: t('settings.licenseExpired'), className: 'bg-red-100 text-red-700' },
    invalid_signature: {
      text: t('settings.licenseInvalidSignature'),
      className: 'bg-gray-100 text-gray-700',
    },
    community: { text: t('settings.licenseCommunity'), className: 'bg-gray-100 text-gray-600' },
  }

  const EDITION_CONFIG: Record<string, { label: string; accent: string; bg: string }> = {
    community: {
      label: t('settings.editionCommunity'),
      accent: 'text-gray-700',
      bg: 'from-gray-50 to-white',
    },
    standard: {
      label: t('settings.editionStandard'),
      accent: 'text-blue-700',
      bg: 'from-blue-50 to-white',
    },
    enterprise: {
      label: t('settings.editionEnterprise'),
      accent: 'text-violet-700',
      bg: 'from-violet-50 to-white',
    },
  }

  const FEATURE_MAP: [LicenseFeature, string][] = [
    ['knowledge_base', t('settings.featureKnowledgeBase')],
    ['multi_model', t('settings.featureMultiModel')],
    ['api_access', t('settings.featureApiAccess')],
    ['sop_engine', t('settings.featureSopEngine')],
    ['channel_integration', t('settings.featureChannelIntegration')],
    ['private_deploy', t('settings.featurePrivateDeploy')],
    ['audit', t('settings.featureAudit')],
    ['role_permission', t('settings.featureRolePermission')],
    ['data_export', t('settings.featureDataExport')],
  ]
  const statusConfig = STATUS_CONFIG[data.status]
  const editionConfig = EDITION_CONFIG[data.edition] ?? EDITION_CONFIG.community

  return (
    <>
      <div className='overflow-hidden rounded-xl border border-gray-200 bg-white'>
        {/* Edition header */}
        <div className={`bg-gradient-to-b ${editionConfig.bg} px-6 pt-5 pb-4`}>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-3'>
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm ${editionConfig.accent}`}
              >
                <Shield className='h-5 w-5' />
              </div>
              <div>
                <h3 className={`font-semibold text-lg ${editionConfig.accent}`}>
                  {editionConfig.label}
                </h3>
                {data.customerName && <p className='text-gray-500 text-sm'>{data.customerName}</p>}
              </div>
            </div>
            <span
              className={`rounded-full px-3 py-1 font-medium text-xs ${statusConfig.className}`}
            >
              {statusConfig.text}
            </span>
          </div>

          {/* Stats row */}
          <div className='mt-4 flex gap-6'>
            <div className='flex items-center gap-2 text-gray-600 text-sm'>
              <Users className='h-4 w-4 text-gray-400' />
              <span>{t('settings.licenseCurrentEmployees')}</span>
              <span className='font-semibold text-gray-900'>{data.currentEmployees}</span>
              <span className='text-gray-400'>
                / {data.maxEmployees === -1 ? t('settings.licenseUnlimited') : data.maxEmployees}
              </span>
            </div>
            {data.expiresAt && (
              <div className='text-gray-600 text-sm'>
                <span>{t('settings.licenseExpireDate')} </span>
                <span className='font-semibold text-gray-900'>{data.expiresAt}</span>
                {data.daysRemaining != null && data.daysRemaining > 0 && (
                  <span className='ml-1 text-gray-400 text-xs'>
                    ({t('settings.licenseDaysRemaining', { days: data.daysRemaining ?? 0 })})
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Feature checklist */}
        <div className='px-6 py-4'>
          <p className='mb-3 font-medium text-gray-400 text-xs uppercase tracking-wide'>
            {t('settings.licenseFeatureList')}
          </p>
          <div className='grid grid-cols-2 gap-x-6 gap-y-2'>
            {FEATURE_MAP.map(([code, label]) => {
              const enabled =
                code === 'role_permission' || code === 'audit' || code === 'data_export'
                  ? true
                  : (data.features ?? []).includes(
                      code as import('@/lib/license/types').LicenseFeature
                    )
              return (
                <div key={code} className='flex items-center gap-2'>
                  {enabled ? (
                    <Check className='h-4 w-4 text-green-500' />
                  ) : (
                    <X className='h-4 w-4 text-gray-300' />
                  )}
                  <span className={`text-sm ${enabled ? 'text-gray-700' : 'text-gray-400'}`}>
                    {label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {data.errorMessage && (
          <div className='mx-6 mb-4 rounded-lg bg-red-50 px-3 py-2 text-red-600 text-xs'>
            {data.errorMessage}
          </div>
        )}
      </div>
    </>
  )
}

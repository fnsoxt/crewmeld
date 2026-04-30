'use client'

import { useTranslation } from '@/hooks/use-translation'
import type { DeploymentInfo, VersionInfo } from '../types'

interface VersionCardProps {
  data: VersionInfo
  deploymentInfo?: DeploymentInfo | null
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className='flex items-center justify-between py-2'>
      <span className='text-gray-500 text-sm'>{label}</span>
      <span className='font-medium text-gray-900 text-sm'>{value ?? '-'}</span>
    </div>
  )
}

export function VersionCard({ data, deploymentInfo }: VersionCardProps) {
  const { t } = useTranslation()
  return (
    <div className='rounded-xl border border-gray-200 bg-white p-6'>
      <h3 className='mb-4 font-semibold text-base text-gray-900'>{t('settings.versionTitle')}</h3>
      <div className='divide-y divide-gray-100'>
        <InfoRow label={t('settings.versionApp')} value={`v${data.appVersion}`} />
        <InfoRow label={t('settings.versionBuildDate')} value={data.buildDate} />
        <InfoRow label={t('settings.versionGitCommit')} value={data.gitCommit} />
        <InfoRow label={t('settings.versionNode')} value={data.nodeVersion} />
        <InfoRow label={t('settings.versionDb')} value={data.dbVersion} />
      </div>
      {deploymentInfo && (
        <>
          <h3 className='mt-6 mb-4 font-semibold text-base text-gray-900'>
            {t('settings.deploymentTitle')}
            <span className='ml-2 rounded bg-blue-50 px-1.5 py-0.5 font-normal text-blue-600 text-xs'>
              K8s
            </span>
          </h3>
          <div className='divide-y divide-gray-100'>
            <InfoRow label={t('settings.deploymentNamespace')} value={deploymentInfo.namespace} />
            <InfoRow label={t('settings.deploymentPod')} value={deploymentInfo.podName} />
            <InfoRow label={t('settings.deploymentNode')} value={deploymentInfo.nodeName} />
            <InfoRow
              label={t('settings.deploymentHelmRelease')}
              value={deploymentInfo.helmRelease}
            />
            <InfoRow
              label={t('settings.deploymentChartVersion')}
              value={deploymentInfo.chartVersion}
            />
          </div>
        </>
      )}
    </div>
  )
}

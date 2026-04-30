'use client'

import { useState } from 'react'
import { cn } from '@/lib/core/utils/cn'
import { useTranslation } from '@/hooks/use-translation'
// import { AlertsTab } from './alerts-tab'
import { ComplianceTab } from './compliance-tab'
import { OperationsTab } from './operations-tab'

type TabKey = 'operations' | 'compliance'

export default function LogsPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabKey>('operations')

  const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
    { key: 'operations', label: t('logs.tabOperations') },
    // { key: 'alerts', label: 'Alerts' },
    { key: 'compliance', label: t('logs.tabCompliance') },
  ]

  return (
    <div>
      <h1 className='mb-6 font-bold text-2xl text-gray-900'>{t('logs.title')}</h1>

      <div className='mb-6 flex border-gray-200 border-b'>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type='button'
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2.5 text-sm transition-colors',
              activeTab === tab.key
                ? 'border-blue-600 border-b-2 font-medium text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'operations' && <OperationsTab />}
      {/* activeTab === 'alerts' && <AlertsTab /> */}
      {activeTab === 'compliance' && <ComplianceTab />}
    </div>
  )
}

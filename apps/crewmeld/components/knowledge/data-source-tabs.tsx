'use client'

import { cn } from '@/lib/core/utils/cn'
import { useTranslation } from '@/hooks/use-translation'

export type DataSource = 'builtin' | 'ragflow'

interface DataSourceTabsProps {
  value: DataSource
  onChange: (v: DataSource) => void
}

export function DataSourceTabs({ value, onChange }: DataSourceTabsProps) {
  const { t } = useTranslation()

  const TABS: Array<{ id: DataSource; label: string }> = [
    { id: 'builtin', label: t('knowledge.builtinKnowledge') },
    { id: 'ragflow', label: t('knowledge.ragflowKnowledge') },
  ]

  return (
    <div
      className='mb-4 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5'
      data-testid='knowledge:tabs:data-source'
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type='button'
          onClick={() => onChange(tab.id)}
          data-testid={`knowledge:tab:${tab.id}`}
          className={cn(
            'rounded-md px-4 py-1.5 font-medium text-sm transition-colors',
            value === tab.id
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

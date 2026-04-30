'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/hooks/use-translation'
import { CostTab } from './components/cost-tab'
import { DateRangePicker } from './components/date-range-picker'
import { ExportReportDialog } from './components/export-report-dialog'
import { OverviewTab } from './components/overview-tab'
import type { DateRange, StatsTab } from './types'

function getDefaultDateRange(): DateRange {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 7)
  return {
    preset: '7d',
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

export default function StatsPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<StatsTab>('overview')
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)

  const TABS: { key: StatsTab; label: string }[] = [
    { key: 'overview', label: t('stats.tabOverview') },
    { key: 'cost', label: t('stats.tabCost') },
  ]

  return (
    <div className='p-6'>
      <div className='mb-6 flex items-center justify-between'>
        <h1 className='font-bold text-2xl text-gray-900'>{t('stats.title')}</h1>
        <div className='flex items-center gap-3'>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <Button variant='outline' onClick={() => setExportDialogOpen(true)}>
            {t('stats.exportReport')}
          </Button>
        </div>
      </div>

      <div className='mb-6 flex gap-1 rounded-lg bg-gray-100 p-1'>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-md px-4 py-2 font-medium text-sm transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab dateRange={dateRange} />}
      {activeTab === 'cost' && <CostTab dateRange={dateRange} />}

      <ExportReportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        dateRange={dateRange}
      />
    </div>
  )
}

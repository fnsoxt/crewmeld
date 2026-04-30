'use client'

import { useMemo } from 'react'
import { useTranslation } from '@/hooks/use-translation'
import type { DateRange, DateRangePreset } from '../types'

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const { t } = useTranslation()

  const PRESETS: { key: DateRangePreset; label: string; days: number }[] = useMemo(
    () => [
      { key: '7d', label: t('stats.dateRangeLast7Days'), days: 7 },
      { key: '30d', label: t('stats.dateRangeLast30Days'), days: 30 },
      { key: '90d', label: t('stats.dateRangeLast90Days'), days: 90 },
    ],
    [t]
  )

  const handlePreset = (preset: DateRangePreset, days: number) => {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - days)
    onChange({
      preset,
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0],
    })
  }

  return (
    <div className='flex items-center gap-2'>
      {PRESETS.map((preset) => (
        <button
          key={preset.key}
          onClick={() => handlePreset(preset.key, preset.days)}
          className={`rounded-lg px-3 py-1.5 font-medium text-xs transition-colors ${
            value.preset === preset.key
              ? 'bg-blue-100 text-blue-700'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          {preset.label}
        </button>
      ))}
      <div className='ml-2 flex items-center gap-1'>
        <input
          type='date'
          value={value.from}
          onChange={(e) => onChange({ ...value, preset: 'custom', from: e.target.value })}
          className='rounded-lg border border-gray-300 px-2 py-1.5 text-gray-700 text-xs focus:border-blue-500 focus:outline-none'
        />
        <span className='text-gray-400 text-xs'>-</span>
        <input
          type='date'
          value={value.to}
          onChange={(e) => onChange({ ...value, preset: 'custom', to: e.target.value })}
          className='rounded-lg border border-gray-300 px-2 py-1.5 text-gray-700 text-xs focus:border-blue-500 focus:outline-none'
        />
      </div>
    </div>
  )
}

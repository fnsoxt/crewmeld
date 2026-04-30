'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTranslation } from '@/hooks/use-translation'
import type { ReportConfig, ReportType, ReportTypeOption } from '../types'

interface ExportReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dateRange?: { from: string; to: string }
}

function getLastMonthRange(): { from: string; to: string } {
  const now = new Date()
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const month = now.getMonth() === 0 ? 12 : now.getMonth()
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

function getLastQuarterRange(): { from: string; to: string } {
  const now = new Date()
  const currentQuarter = Math.floor(now.getMonth() / 3)
  let year = now.getFullYear()
  let quarterStart: number

  if (currentQuarter === 0) {
    year -= 1
    quarterStart = 9
  } else {
    quarterStart = (currentQuarter - 1) * 3
  }

  const fromMonth = quarterStart + 1
  const toMonth = quarterStart + 3
  const from = `${year}-${String(fromMonth).padStart(2, '0')}-01`
  const lastDay = new Date(year, toMonth, 0).getDate()
  const to = `${year}-${String(toMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

function getDefaultRange(reportType: ReportType): { from: string; to: string } {
  switch (reportType) {
    case 'monthly':
      return getLastMonthRange()
    case 'quarterly':
      return getLastQuarterRange()
    case 'custom': {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - 30)
      return {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
      }
    }
  }
}

export function ExportReportDialog({ open, onOpenChange, dateRange }: ExportReportDialogProps) {
  const { t, locale } = useTranslation()

  const REPORT_TYPE_OPTIONS: ReportTypeOption[] = useMemo(
    () => [
      {
        key: 'monthly',
        label: t('stats.exportMonthly'),
        description: t('stats.exportMonthlyDesc'),
      },
      {
        key: 'quarterly',
        label: t('stats.exportQuarterly'),
        description: t('stats.exportQuarterlyDesc'),
      },
      {
        key: 'custom',
        label: t('stats.exportCustom'),
        description: t('stats.exportCustomDesc'),
      },
    ],
    [t]
  )

  const [config, setConfig] = useState<ReportConfig>(() => ({
    reportType: 'custom',
    dateFrom: dateRange?.from ?? getDefaultRange('custom').from,
    dateTo: dateRange?.to ?? getDefaultRange('custom').to,
  }))
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setConfig({
        reportType: 'custom',
        dateFrom: dateRange?.from ?? getDefaultRange('custom').from,
        dateTo: dateRange?.to ?? getDefaultRange('custom').to,
      })
      setIsGenerating(false)
      setError(null)
    }
  }, [open, dateRange])

  const handleReportTypeChange = useCallback((reportType: ReportType) => {
    const range = getDefaultRange(reportType)
    setConfig({
      reportType,
      dateFrom: range.from,
      dateTo: range.to,
    })
    setError(null)
  }, [])

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true)
    setError(null)

    try {
      const response = await fetch('/api/employee/stats/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportType: config.reportType,
          dateFrom: config.dateFrom,
          dateTo: config.dateTo,
          locale,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error ?? `HTTP ${response.status}`)
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = response.headers.get('Content-Disposition')
      const filenameMatch = disposition?.match(/filename="(.+)"/)
      a.download = filenameMatch?.[1] ?? `crewmeld-report-${config.dateFrom}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('stats.exportGenerateFailed'))
    } finally {
      setIsGenerating(false)
    }
  }, [config, onOpenChange, t, locale])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[480px]'>
        <DialogHeader>
          <DialogTitle>{t('stats.exportTitle')}</DialogTitle>
          <DialogDescription>{t('stats.exportDescription')}</DialogDescription>
        </DialogHeader>

        <div className='space-y-5 py-4'>
          <div>
            <span className='mb-2 block font-medium text-gray-700 text-sm'>
              {t('stats.exportReportType')}
            </span>
            <div className='grid grid-cols-3 gap-2'>
              {REPORT_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  onClick={() => handleReportTypeChange(option.key)}
                  disabled={isGenerating}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    config.reportType === option.key
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  } ${isGenerating ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <div className='font-medium text-gray-900 text-sm'>{option.label}</div>
                  <div className='mt-0.5 text-gray-500 text-xs'>{option.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className='mb-2 block font-medium text-gray-700 text-sm'>
              {t('stats.exportDateRange')}
            </span>
            <div className='flex items-center gap-2'>
              <input
                type='date'
                aria-label={t('stats.exportDateRange')}
                value={config.dateFrom}
                onChange={(e) => setConfig((prev) => ({ ...prev, dateFrom: e.target.value }))}
                disabled={isGenerating || config.reportType !== 'custom'}
                className={`flex-1 rounded-lg border border-gray-300 px-3 py-2 text-gray-700 text-sm focus:border-blue-500 focus:outline-none ${
                  config.reportType !== 'custom' ? 'bg-gray-50' : 'bg-white'
                } ${isGenerating ? 'cursor-not-allowed opacity-50' : ''}`}
              />
              <span className='text-gray-400 text-sm'>{t('stats.exportTo')}</span>
              <input
                type='date'
                aria-label={t('stats.exportDateRange')}
                value={config.dateTo}
                onChange={(e) => setConfig((prev) => ({ ...prev, dateTo: e.target.value }))}
                disabled={isGenerating || config.reportType !== 'custom'}
                className={`flex-1 rounded-lg border border-gray-300 px-3 py-2 text-gray-700 text-sm focus:border-blue-500 focus:outline-none ${
                  config.reportType !== 'custom' ? 'bg-gray-50' : 'bg-white'
                } ${isGenerating ? 'cursor-not-allowed opacity-50' : ''}`}
              />
            </div>
            {config.reportType !== 'custom' && (
              <p className='mt-1 text-gray-400 text-xs'>{t('stats.exportAutoCalculated')}</p>
            )}
          </div>

          <div>
            <span className='mb-2 block font-medium text-gray-700 text-sm'>
              {t('stats.exportFormat')}
            </span>
            <div className='inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-2'>
              <svg className='mr-2 h-4 w-4 text-red-500' fill='currentColor' viewBox='0 0 20 20'>
                <path d='M4 18h12a2 2 0 002-2V6l-4-4H4a2 2 0 00-2 2v12a2 2 0 002 2zm8-14l4 4h-4V4zM6 12h8v2H6v-2zm0-3h8v2H6V9z' />
              </svg>
              <span className='text-gray-700 text-sm'>PDF</span>
            </div>
          </div>

          {error && (
            <div className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-600 text-sm'>
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={isGenerating}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <span className='flex items-center gap-2'>
                <svg className='h-4 w-4 animate-spin' fill='none' viewBox='0 0 24 24'>
                  <circle
                    className='opacity-25'
                    cx='12'
                    cy='12'
                    r='10'
                    stroke='currentColor'
                    strokeWidth='4'
                  />
                  <path
                    className='opacity-75'
                    fill='currentColor'
                    d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z'
                  />
                </svg>
                {t('stats.exportGenerating')}
              </span>
            ) : (
              t('stats.exportGenerate')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

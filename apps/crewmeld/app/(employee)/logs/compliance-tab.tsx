'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from '@/hooks/use-translation'

interface ExportPreview {
  totalRecords: number
  dateRange: { start: string; end: string }
  breakdown: { category: string; count: number }[]
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function ComplianceTab() {
  const { t, locale } = useTranslation()

  const CATEGORY_OPTIONS = useMemo(
    () => [
      { value: 'all', label: t('logs.complianceCategoryAll') },
      { value: 'security', label: t('logs.complianceCategorySecurityOnly') },
      { value: 'operations', label: t('logs.complianceCategoryOperationsOnly') },
    ],
    [t]
  )

  const RESOURCE_TYPE_LABELS: Record<string, string> = useMemo(
    () => ({
      employee: t('logs.resourceEmployee'),
      human_employee: t('logs.resourceHumanEmployee'),
      conversation: t('logs.resourceConversation'),
      channel: t('logs.resourceChannel'),
      connector: t('logs.resourceConnector'),
      model_config: t('logs.resourceModelConfig'),
      sop: t('logs.resourceSop'),
      scheduled_task: t('logs.resourceScheduledTask'),
      task: t('logs.resourceTask'),
      template: t('logs.resourceTemplate'),
      skill: t('logs.resourceSkill'),
      knowledge: t('logs.resourceKnowledge'),
      workflow: t('logs.resourceWorkflow'),
      system_config: t('logs.resourceSystemConfig'),
      user_management: t('logs.resourceUserManagement'),
      tool: t('logs.resourceTool'),
      integration: t('logs.resourceIntegration'),
      workshop: t('logs.resourceWorkshop'),
      audit_export: t('logs.resourceAuditExport'),
      chat: 'Chat',
    }),
    [t]
  )

  const defaultEnd = new Date()
  const defaultStart = new Date()
  defaultStart.setDate(defaultStart.getDate() - 30)

  const [startDate, setStartDate] = useState(toDateInputValue(defaultStart))
  const [endDate, setEndDate] = useState(toDateInputValue(defaultEnd))
  const [category, setCategory] = useState('all')
  const [preview, setPreview] = useState<ExportPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPreview = useCallback(async () => {
    if (!startDate || !endDate) return
    setPreviewLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(`${endDate}T23:59:59`).toISOString(),
        category,
        preview: 'true',
        locale,
      })
      const res = await fetch(`/api/audit/export?${params.toString()}`)
      const json = await res.json()
      if (!json.success) {
        setError(json.error)
        setPreview(null)
        return
      }
      setPreview(json.data)
    } catch {
      setError(t('logs.compliancePreviewFailed'))
      setPreview(null)
    } finally {
      setPreviewLoading(false)
    }
  }, [startDate, endDate, category, locale, t])

  useEffect(() => {
    fetchPreview()
  }, [fetchPreview])

  const handleExport = useCallback(async () => {
    setExporting(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(`${endDate}T23:59:59`).toISOString(),
        category,
        format: 'csv',
        locale,
      })
      const res = await fetch(`/api/audit/export?${params.toString()}`)

      if (!res.ok) {
        const json = await res.json()
        setError(json.error ?? t('logs.complianceExportFailed'))
        return
      }

      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const filenameMatch = disposition.match(/filename="(.+)"/)
      const filename = filenameMatch?.[1] ?? `audit_export.csv`

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError(t('logs.complianceExportFailedRetry'))
    } finally {
      setExporting(false)
    }
  }, [startDate, endDate, category, locale, t])

  const numberLocale = locale === 'zh-CN' ? 'zh-CN' : 'en-US'

  return (
    <div>
      {/* Export config form */}
      <div className='rounded-lg border border-gray-200 bg-white p-6'>
        <h3 className='mb-4 font-medium text-gray-900 text-sm'>
          {t('logs.complianceExportConfig')}
        </h3>
        <div className='space-y-4'>
          <div className='flex gap-4'>
            <div>
              <label htmlFor='compliance-start-date' className='mb-1 block text-gray-500 text-xs'>
                {t('logs.complianceStartDate')}
              </label>
              <input
                id='compliance-start-date'
                type='date'
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className='rounded-md border border-gray-300 px-3 py-2 text-sm'
              />
            </div>
            <div>
              <label htmlFor='compliance-end-date' className='mb-1 block text-gray-500 text-xs'>
                {t('logs.complianceEndDate')}
              </label>
              <input
                id='compliance-end-date'
                type='date'
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className='rounded-md border border-gray-300 px-3 py-2 text-sm'
              />
            </div>
          </div>

          <div>
            <label htmlFor='compliance-category' className='mb-1 block text-gray-500 text-xs'>
              {t('logs.complianceExportCategory')}
            </label>
            <select
              id='compliance-category'
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className='rounded-md border border-gray-300 bg-white px-3 py-2 text-sm'
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className='mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm'>
          {error}
        </div>
      )}

      {/* Preview */}
      {previewLoading ? (
        <div className='mt-4 h-32 animate-pulse rounded-lg border border-gray-200 bg-gray-100' />
      ) : preview ? (
        <div className='mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4'>
          <h4 className='font-medium text-gray-900 text-sm'>{t('logs.complianceExportPreview')}</h4>
          <div className='mt-2 text-gray-600 text-sm'>
            <span className='font-medium text-gray-900'>
              {preview.totalRecords.toLocaleString(numberLocale)}
            </span>{' '}
            {t('logs.complianceRecordCount')}
          </div>

          {preview.breakdown.length > 0 &&
            (() => {
              // Merge resource types with the same display name (e.g. skill/tool/template all map to "Tool Management")
              const merged = new Map<string, number>()
              for (const row of preview.breakdown) {
                const label = RESOURCE_TYPE_LABELS[row.category] ?? row.category
                merged.set(label, (merged.get(label) ?? 0) + row.count)
              }
              return (
                <table className='mt-3 w-full text-sm'>
                  <thead>
                    <tr className='text-left text-gray-500 text-xs'>
                      <th className='pb-1'>{t('logs.complianceResourceType')}</th>
                      <th className='pb-1 text-right'>{t('logs.complianceRecordCountHeader')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(merged.entries())
                      .sort((a, b) => b[1] - a[1])
                      .map(([label, count]) => (
                        <tr key={label} className='border-gray-200 border-t'>
                          <td className='py-1 text-gray-700'>{label}</td>
                          <td className='py-1 text-right text-gray-900'>
                            {count.toLocaleString(numberLocale)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )
            })()}
        </div>
      ) : (
        <div className='mt-4 rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-400 text-sm'>
          {t('logs.complianceSelectRange')}
        </div>
      )}

      {/* Export button */}
      <div className='mt-6'>
        <button
          type='button'
          onClick={handleExport}
          disabled={exporting || !preview || preview.totalRecords === 0}
          className='rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-sm text-white hover:bg-blue-700 disabled:opacity-50'
        >
          {exporting ? t('logs.complianceExporting') : t('logs.complianceExportCsv')}
        </button>
      </div>
    </div>
  )
}

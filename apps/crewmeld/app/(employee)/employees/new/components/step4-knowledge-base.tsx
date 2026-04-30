'use client'

import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Info, Loader2 } from 'lucide-react'
import type { RagflowDataset } from '@/lib/ragflow/types'
import { useTranslation } from '@/hooks/use-translation'

interface Step4KnowledgeBaseProps {
  selectedKBIds: string[]
  onSelectionChange: (ids: string[]) => void
  selectedRagflowDatasetIds: string[]
  onRagflowSelectionChange: (ids: string[]) => void
}

function KBCheckbox({ selected }: { selected: boolean }) {
  return (
    <div className='mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-300'>
      {selected && (
        <svg className='h-3.5 w-3.5 text-blue-600' viewBox='0 0 14 14' fill='none'>
          <path
            d='M11.6667 3.5L5.25 9.91667L2.33333 7'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        </svg>
      )}
    </div>
  )
}

export function Step4KnowledgeBase({
  selectedRagflowDatasetIds,
  onRagflowSelectionChange,
}: Step4KnowledgeBaseProps) {
  const { t } = useTranslation()
  const [ragflowDatasets, setRagflowDatasets] = useState<RagflowDataset[]>([])
  const [ragflowLoading, setRagflowLoading] = useState(true)
  const [ragflowAvailable, setRagflowAvailable] = useState(false)

  const fetchRagflowDatasets = useCallback(async () => {
    setRagflowLoading(true)
    try {
      const res = await fetch('/api/employee/ragflow/datasets')
      const json = await res.json()
      if (res.ok && json.success) {
        setRagflowAvailable(true)
        setRagflowDatasets(json.data ?? [])
      } else {
        setRagflowAvailable(false)
      }
    } catch {
      setRagflowAvailable(false)
    } finally {
      setRagflowLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRagflowDatasets()
  }, [fetchRagflowDatasets])

  const handleToggleRagflow = (datasetId: string) => {
    if (selectedRagflowDatasetIds.includes(datasetId)) {
      onRagflowSelectionChange(selectedRagflowDatasetIds.filter((id) => id !== datasetId))
    } else {
      onRagflowSelectionChange([...selectedRagflowDatasetIds, datasetId])
    }
  }

  return (
    <div>
      <h2 className='mb-2 font-semibold text-gray-900 text-lg'>
        {t('employees.knowledgeStepTitle')}
      </h2>
      <p className='mb-6 text-gray-500 text-sm'>{t('employees.knowledgeStepDescription')}</p>

      <div className='mx-auto max-w-lg'>
        {ragflowLoading ? (
          <div className='flex h-48 flex-col items-center justify-center rounded-xl border border-gray-300 border-dashed'>
            <Loader2 className='mb-2 h-8 w-8 animate-spin text-gray-300' />
            <p className='text-gray-400 text-sm'>{t('employees.knowledgeStepLoading')}</p>
          </div>
        ) : !ragflowAvailable || ragflowDatasets.length === 0 ? (
          <div className='flex h-48 flex-col items-center justify-center rounded-xl border-2 border-gray-300 border-dashed bg-gray-50'>
            <BookOpen className='mb-3 h-10 w-10 text-gray-300' />
            <p className='font-medium text-gray-500 text-sm'>{t('employees.knowledgeStepNoKb')}</p>
            <p className='mt-1 text-gray-400 text-xs'>{t('employees.knowledgeStepCreateLater')}</p>
          </div>
        ) : (
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            {ragflowDatasets.map((ds) => {
              const isSelected = selectedRagflowDatasetIds.includes(ds.id)
              return (
                <button
                  key={ds.id}
                  type='button'
                  onClick={() => handleToggleRagflow(ds.id)}
                  className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                  data-testid={`step4:ragflow:${ds.id}`}
                >
                  <KBCheckbox selected={isSelected} />
                  <div className='min-w-0 flex-1'>
                    <p className='font-medium text-gray-900 text-sm'>{ds.name}</p>
                    {ds.description && (
                      <p className='mt-0.5 line-clamp-2 text-gray-500 text-xs'>{ds.description}</p>
                    )}
                    <p className='mt-2 text-gray-400 text-xs'>
                      {ds.document_count} {t('employees.documentsSuffix')} · {ds.chunk_count}{' '}
                      {t('employees.chunksSuffix')}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <div className='mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4'>
          <div className='flex items-start gap-2'>
            <Info className='mt-0.5 h-4 w-4 shrink-0 text-blue-600' />
            <div>
              <p className='font-medium text-blue-800 text-sm'>
                {t('employees.knowledgeStepCanContinue')}
              </p>
              <p className='mt-0.5 text-blue-600 text-xs'>
                {t('employees.knowledgeStepOptionalHint')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

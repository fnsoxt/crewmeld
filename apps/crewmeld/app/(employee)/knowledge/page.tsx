'use client'

import { RagflowDatasetList } from '@/components/knowledge/ragflow-dataset-list'
import { useTranslation } from '@/hooks/use-translation'

export default function KnowledgeListPage() {
  const { t } = useTranslation()
  return (
    <div>
      <div className='mb-6 flex items-center justify-between'>
        <h1 className='font-semibold text-2xl text-gray-900'>{t('knowledge.title')}</h1>
      </div>
      <RagflowDatasetList />
    </div>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type {
  ModelConfigData,
  ModelTestResult,
  OllamaModel,
  ProviderDisplayInfo,
} from '@/lib/models/types'
import { useTranslation } from '@/hooks/use-translation'
import { AddModelWizard } from './add-model-wizard'
import { ModelChatDialog } from './model-chat-dialog'
import { ModelConfigCard } from './model-config-card'
import { ModelConfigDialog } from './model-config-dialog'

interface ModelConfigTabProps {
  isAdmin?: boolean
}

export function ModelConfigTab({ isAdmin = true }: ModelConfigTabProps) {
  const { t, tMessage } = useTranslation()
  const [configs, setConfigs] = useState<ModelConfigData[]>([])
  const [availableProviders, setAvailableProviders] = useState<ProviderDisplayInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [testingAll, setTestingAll] = useState(false)
  const [testResults, setTestResults] = useState<Record<string, ModelTestResult>>({})

  const [wizardOpen, setWizardOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState<ModelConfigData | null>(null)
  const [chatDialogOpen, setChatDialogOpen] = useState(false)
  const [chatConfig, setChatConfig] = useState<ModelConfigData | null>(null)

  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([])
  const [ollamaDiscovering, setOllamaDiscovering] = useState(false)
  const [ollamaEndpoint, setOllamaEndpoint] = useState('')
  const [ollamaError, setOllamaError] = useState<string | null>(null)

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch('/api/employee/models')
      const data = await res.json()
      if (data.success) {
        setConfigs(data.data.configs)
        setAvailableProviders(data.data.availableProviders)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConfigs()
  }, [fetchConfigs])

  const configCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const c of configs) {
      counts[c.providerId] = (counts[c.providerId] ?? 0) + 1
    }
    return counts
  }, [configs])

  const handleEdit = useCallback((config: ModelConfigData) => {
    setEditingConfig(config)
    setEditDialogOpen(true)
  }, [])

  const handleChat = useCallback((config: ModelConfigData) => {
    setChatConfig(config)
    setChatDialogOpen(true)
  }, [])

  const handleToggleActive = useCallback(
    async (config: ModelConfigData) => {
      await fetch(`/api/employee/models/${config.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !config.isActive }),
      })
      fetchConfigs()
    },
    [fetchConfigs]
  )

  const handleTestOne = useCallback(
    async (configId: string) => {
      setTestResults((prev) => ({
        ...prev,
        [configId]: {
          success: false,
          message: t('connections.testingMessage'),
          latencyMs: 0,
          model: '',
        },
      }))
      try {
        const res = await fetch(`/api/employee/models/${configId}/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        const data = await res.json()
        if (data.success && data.data) {
          setTestResults((prev) => ({ ...prev, [configId]: data.data }))
        } else {
          setTestResults((prev) => ({
            ...prev,
            [configId]: {
              success: false,
              message: tMessage(data) || t('common.operationFailed'),
              latencyMs: 0,
              model: '',
            },
          }))
        }
        fetchConfigs()
      } catch {
        setTestResults((prev) => ({
          ...prev,
          [configId]: {
            success: false,
            message: t('connections.networkRequestFailed'),
            latencyMs: 0,
            model: '',
          },
        }))
      }
    },
    [fetchConfigs, t, tMessage]
  )

  const handleTestAll = useCallback(async () => {
    const activeConfigs = configs.filter((c) => c.isActive)
    if (activeConfigs.length === 0) return
    setTestingAll(true)
    for (const config of activeConfigs) {
      await handleTestOne(config.id)
    }
    setTestingAll(false)
  }, [configs, handleTestOne])

  const handleDiscoverOllama = useCallback(async () => {
    setOllamaDiscovering(true)
    setOllamaError(null)
    try {
      const res = await fetch('/api/employee/models/discover-ollama', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = await res.json()
      if (!body.success) {
        setOllamaModels([])
        setOllamaError(tMessage(body) || t('connections.ollamaNotDetected'))
        return
      }
      const result = body.data
      if (result?.available) {
        setOllamaModels(result.models)
        setOllamaEndpoint(result.endpoint)
      } else {
        setOllamaModels([])
        setOllamaError(result?.error ?? t('connections.ollamaNotDetected'))
      }
    } catch {
      setOllamaError(t('connections.ollamaNetworkError'))
    } finally {
      setOllamaDiscovering(false)
    }
  }, [t, tMessage])

  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return
    try {
      await fetch(`/api/employee/models/${deleteConfirm}`, { method: 'DELETE' })
      fetchConfigs()
    } finally {
      setDeleteConfirm(null)
    }
  }, [deleteConfirm, fetchConfigs])

  const formatBytes = (bytes: number) => {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
    return `${bytes} B`
  }

  if (loading) {
    return (
      <div className='space-y-4'>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className='h-20 animate-pulse rounded-lg border border-gray-200 bg-gray-100'
          />
        ))}
      </div>
    )
  }

  const activeCount = configs.filter((c) => c.isActive).length

  return (
    <div>
      {/* Header */}
      <div className='mb-6 flex items-center justify-between'>
        <p className='text-gray-500 text-sm'>
          {t('connections.configuredModels', { total: configs.length, active: activeCount })}
        </p>
        <div className='flex gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={handleTestAll}
            disabled={testingAll || activeCount === 0}
          >
            {testingAll && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('connections.testAll')}
          </Button>
          {isAdmin && (
            <Button size='sm' onClick={() => setWizardOpen(true)}>
              <Plus className='mr-1 h-4 w-4' />
              {t('connections.addModel')}
            </Button>
          )}
        </div>
      </div>

      {/* Empty state OR card grid */}
      {configs.length === 0 ? (
        <div className='flex flex-col items-center justify-center rounded-xl border-2 border-gray-300 border-dashed py-16'>
          <p className='mb-1 font-medium text-gray-600 text-sm'>{t('connections.noModels')}</p>
          <p className='mb-4 text-gray-400 text-xs'>{t('connections.noModelsHint')}</p>
          {isAdmin && (
            <Button onClick={() => setWizardOpen(true)}>
              <Plus className='mr-1 h-4 w-4' />
              {t('connections.addFirstModel')}
            </Button>
          )}
        </div>
      ) : (
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {configs.map((c) => (
            <ModelConfigCard
              key={c.id}
              config={c}
              isAdmin={isAdmin}
              testResult={testResults[c.id]}
              onEdit={handleEdit}
              onDelete={(id) => setDeleteConfirm(id)}
              onTest={handleTestOne}
              onToggleActive={handleToggleActive}
              onChat={handleChat}
            />
          ))}
        </div>
      )}

      {/* Ollama section */}
      <div className='mt-6 rounded-lg border border-gray-300 border-dashed bg-gray-50 p-4'>
        <div className='flex items-center justify-between'>
          <div>
            <h3 className='font-semibold text-gray-700 text-sm'>{t('connections.ollamaTitle')}</h3>
            <p className='text-gray-500 text-xs'>{t('connections.ollamaSubtitle')}</p>
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={handleDiscoverOllama}
            disabled={ollamaDiscovering}
          >
            {ollamaDiscovering && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('connections.ollamaDiscover')}
          </Button>
        </div>

        {ollamaError && <p className='mt-3 text-red-500 text-xs'>{ollamaError}</p>}

        {ollamaModels.length > 0 && (
          <div className='mt-3 space-y-2'>
            <p className='text-gray-500 text-xs'>
              {t('connections.ollamaDiscovered', {
                count: ollamaModels.length,
                endpoint: ollamaEndpoint,
              })}
            </p>
            <div className='divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white'>
              {ollamaModels.map((m) => (
                <div key={m.digest} className='flex items-center justify-between px-4 py-2'>
                  <div>
                    <span className='font-medium text-gray-900 text-sm'>{m.name}</span>
                    <span className='ml-2 text-gray-400 text-xs'>{formatBytes(m.size)}</span>
                  </div>
                  <span className='text-gray-400 text-xs'>
                    {new Date(m.modifiedAt).toLocaleDateString('zh-CN')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add model wizard */}
      <AddModelWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        availableProviders={availableProviders}
        existingConfigCounts={configCounts}
        onCreated={fetchConfigs}
      />

      {/* Edit dialog */}
      <ModelConfigDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        config={editingConfig}
        onSaved={fetchConfigs}
      />

      {/* Chat dialog */}
      <ModelChatDialog open={chatDialogOpen} onOpenChange={setChatDialogOpen} config={chatConfig} />

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
          <div className='w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl'>
            <h3 className='mb-2 font-semibold text-gray-900 text-lg'>
              {t('common.confirmDelete')}
            </h3>
            <p className='mb-4 text-gray-500 text-sm'>{t('connections.confirmDeleteModelDesc')}</p>
            <div className='flex justify-end gap-2'>
              <Button variant='outline' onClick={() => setDeleteConfirm(null)}>
                {t('common.cancel')}
              </Button>
              <Button variant='destructive' onClick={handleDelete}>
                {t('common.confirmDelete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

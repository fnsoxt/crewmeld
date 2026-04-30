'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Brain, Link2, Link2Off, Loader2, Radio, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { ConnectionType } from '@/lib/connectors/types'
import {
  CONNECTION_TYPE_I18N_KEYS,
  CONNECTION_TYPE_ICONS,
  getDatabaseDisplayIcon,
  getDatabaseDisplayLabel,
} from '@/lib/connectors/types'
import { cn } from '@/lib/core/utils/cn'
import { useTranslation } from '@/hooks/use-translation'
import { PROVIDER_DEFINITIONS } from '@/providers/models'
import { useEmployeeConnections } from '../hooks/use-employee-connections'

interface BoundModel {
  id: string
  providerId: string
  displayName: string
  modelName: string | null
  isActive: boolean
}

interface AvailableModelItem {
  id: string
  providerId: string
  displayName: string
  modelName: string | null
  isActive: boolean
  providerName: string
}

interface ConnectionsTabProps {
  employeeId: string
  boundModel: BoundModel | null
  onModelChange: () => void
}

export function ConnectionsTab({ employeeId, boundModel, onModelChange }: ConnectionsTabProps) {
  const { t } = useTranslation()
  const { boundConnections, availableConnections, loading, error, bind, unbind } =
    useEmployeeConnections(employeeId)

  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [modelDialogOpen, setModelDialogOpen] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [availableModels, setAvailableModels] = useState<AvailableModelItem[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [bindingModelId, setBindingModelId] = useState<string | null>(null)
  const [modelActionLoading, setModelActionLoading] = useState(false)

  const fetchAvailableModels = useCallback(async () => {
    setModelsLoading(true)
    try {
      const res = await fetch('/api/employee/models?activeOnly=true')
      const json = await res.json()
      if (json.success) {
        const items: AvailableModelItem[] = json.data.configs.map(
          (c: {
            id: string
            providerId: string
            displayName: string
            modelName: string | null
            isActive: boolean
            providerMeta: { name: string }
          }) => ({
            id: c.id,
            providerId: c.providerId,
            displayName: c.displayName,
            modelName: c.modelName,
            isActive: c.isActive,
            providerName: c.providerMeta.name,
          })
        )
        setAvailableModels(items)
      }
    } catch {
      // ignore
    } finally {
      setModelsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (modelDialogOpen) {
      fetchAvailableModels()
    }
  }, [modelDialogOpen, fetchAvailableModels])

  const boundChannels = useMemo(
    () => boundConnections.filter((c) => c.isChannel),
    [boundConnections]
  )
  const boundSystemConns = useMemo(
    () => boundConnections.filter((c) => !c.isChannel),
    [boundConnections]
  )
  const availableChannels = useMemo(
    () => availableConnections.filter((c) => c.isChannel),
    [availableConnections]
  )
  const availableSystemConns = useMemo(
    () => availableConnections.filter((c) => !c.isChannel),
    [availableConnections]
  )

  const filteredModels = useMemo(() => {
    const models = availableModels.filter((m) => m.id !== boundModel?.id)
    if (!modelSearch.trim()) return models
    const keyword = modelSearch.trim().toLowerCase()
    return models.filter(
      (m) =>
        m.displayName.toLowerCase().includes(keyword) ||
        m.providerName.toLowerCase().includes(keyword) ||
        m.modelName?.toLowerCase().includes(keyword)
    )
  }, [availableModels, modelSearch, boundModel?.id])

  const handleBind = async (connectionId: string) => {
    setActionLoading(connectionId)
    setActionError(null)
    try {
      await bind(connectionId)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('common.operationFailed'))
    } finally {
      setActionLoading(null)
    }
  }

  const handleUnbind = async (connectionId: string) => {
    setActionLoading(connectionId)
    setActionError(null)
    try {
      await unbind(connectionId)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('common.operationFailed'))
    } finally {
      setActionLoading(null)
    }
  }

  const handleUnbindModel = async () => {
    setModelActionLoading(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/employee/employees/${employeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelConfigId: null }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? t('common.operationFailed'))
      }
      onModelChange()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('common.operationFailed'))
    } finally {
      setModelActionLoading(false)
    }
  }

  const handleBindModel = async (modelConfigId: string) => {
    setBindingModelId(modelConfigId)
    setActionError(null)
    try {
      const res = await fetch(`/api/employee/employees/${employeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelConfigId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? t('common.operationFailed'))
      }
      setModelDialogOpen(false)
      setModelSearch('')
      onModelChange()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('common.operationFailed'))
    } finally {
      setBindingModelId(null)
    }
  }

  const getProviderIcon = (providerId: string) => {
    const provider = PROVIDER_DEFINITIONS[providerId]
    return provider?.icon ?? null
  }

  if (loading) {
    return (
      <div className='space-y-4'>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className='h-16 animate-pulse rounded-lg bg-gray-200' />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className='rounded-lg border border-red-200 bg-red-50 p-4 text-red-600 text-sm'>
        {error}
      </div>
    )
  }

  return (
    <div className='space-y-6' data-testid='employee-connections:container'>
      {actionError && (
        <div className='rounded-lg border border-red-200 bg-red-50 p-3 text-red-600 text-sm'>
          {actionError}
        </div>
      )}

      {/* LLM model binding */}
      <div>
        <div className='mb-3 flex items-center justify-between'>
          <h3 className='font-semibold text-gray-900 text-sm'>{t('employees.boundModel')}</h3>
          {!boundModel && (
            <Button
              variant='outline'
              size='sm'
              data-testid='employee-models:bind-btn'
              onClick={() => setModelDialogOpen(true)}
            >
              <Brain className='mr-1 h-3.5 w-3.5' />
              {t('employees.wizardStepModel')}
            </Button>
          )}
        </div>
        {boundModel ? (
          <div
            data-testid={`employee-models:bound:${boundModel.id}`}
            className='flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3'
          >
            <div className='flex items-center gap-3'>
              <div className='flex h-8 w-8 items-center justify-center rounded-md bg-purple-50'>
                {(() => {
                  const ProviderIcon = getProviderIcon(boundModel.providerId)
                  return ProviderIcon ? (
                    <ProviderIcon className='h-4 w-4 text-purple-600' />
                  ) : (
                    <Brain className='h-4 w-4 text-purple-600' />
                  )
                })()}
              </div>
              <div>
                <p className='font-medium text-gray-900 text-sm'>{boundModel.displayName}</p>
                <div className='flex items-center gap-2 text-gray-500 text-xs'>
                  <span>{boundModel.providerId}</span>
                  {boundModel.modelName && (
                    <>
                      <span>·</span>
                      <span className='font-mono'>{boundModel.modelName}</span>
                    </>
                  )}
                  <span>·</span>
                  <span
                    className={cn(
                      'inline-block h-2 w-2 rounded-full',
                      boundModel.isActive ? 'bg-green-500' : 'bg-gray-400'
                    )}
                  />
                  <span>{boundModel.isActive ? t('common.enabled') : t('common.disabled')}</span>
                </div>
              </div>
            </div>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                data-testid='employee-models:rebind-btn'
                onClick={() => setModelDialogOpen(true)}
              >
                <Brain className='h-3.5 w-3.5' />
                {t('common.edit')}
              </Button>
              <Button
                variant='outline'
                size='sm'
                data-testid='employee-models:unbind-btn'
                disabled={modelActionLoading}
                onClick={handleUnbindModel}
              >
                {modelActionLoading ? (
                  <Loader2 className='h-3.5 w-3.5 animate-spin' />
                ) : (
                  <Link2Off className='h-3.5 w-3.5' />
                )}
                {t('employees.knowledgeUnbind')}
              </Button>
            </div>
          </div>
        ) : (
          <div className='rounded-lg border-2 border-gray-200 border-dashed py-8 text-center'>
            <Brain className='mx-auto mb-2 h-8 w-8 text-gray-300' />
            <p className='text-gray-500 text-sm'>{t('employees.notBound')}</p>
            <p className='mt-1 text-gray-400 text-xs'>{t('employees.bindModelDescription')}</p>
          </div>
        )}
      </div>

      {/* Message channels */}
      <div>
        <div className='mb-3 flex items-center gap-2'>
          <Radio className='h-4 w-4 text-gray-500' />
          <h3 className='font-semibold text-gray-900 text-sm'>{t('channels.title')}</h3>
        </div>
        <p className='mb-3 text-gray-400 text-xs'>{t('channels.subtitle')}</p>

        {/* Bound channels */}
        {boundChannels.length > 0 && (
          <div className='mb-3 space-y-2'>
            {boundChannels.map((conn) => (
              <div
                key={conn.connectionId}
                data-testid={`employee-connections:bound:${conn.connectionId}`}
                className='flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50/30 px-4 py-3'
              >
                <div className='flex items-center gap-3'>
                  <span className='text-lg'>
                    {conn.type === 'database' && conn.config
                      ? getDatabaseDisplayIcon(conn.config)
                      : (CONNECTION_TYPE_ICONS[conn.type as ConnectionType] ?? '📡')}
                  </span>
                  <div>
                    <p className='font-medium text-gray-900 text-sm'>{conn.name}</p>
                    <div className='flex items-center gap-2 text-gray-500 text-xs'>
                      <span>
                        {conn.type === 'database' && conn.config
                          ? (getDatabaseDisplayLabel(conn.config) ?? t('connections.typeDatabase'))
                          : CONNECTION_TYPE_I18N_KEYS[conn.type as ConnectionType]
                            ? t(CONNECTION_TYPE_I18N_KEYS[conn.type as ConnectionType])
                            : conn.type}
                      </span>
                      <span>·</span>
                      <span
                        className={cn(
                          'inline-block h-2 w-2 rounded-full',
                          conn.status === 'connected' && 'bg-green-500',
                          conn.status === 'error' && 'bg-red-500',
                          conn.status === 'disconnected' && 'bg-gray-400'
                        )}
                      />
                      <span>
                        {conn.status === 'connected'
                          ? t('connections.statusConnected')
                          : conn.status === 'error'
                            ? t('connections.statusError')
                            : t('connections.statusDisconnected')}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  variant='outline'
                  size='sm'
                  data-testid={`employee-connections:unbind:${conn.connectionId}`}
                  disabled={actionLoading === conn.connectionId}
                  onClick={() => handleUnbind(conn.connectionId)}
                >
                  {actionLoading === conn.connectionId ? (
                    <Loader2 className='h-3.5 w-3.5 animate-spin' />
                  ) : (
                    <Link2Off className='h-3.5 w-3.5' />
                  )}
                  {t('employees.knowledgeUnbind')}
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Available channels */}
        {availableChannels.length > 0 ? (
          <div className='space-y-2'>
            {availableChannels.map((conn) => (
              <div
                key={conn.connectionId}
                data-testid={`employee-connections:available:${conn.connectionId}`}
                className='flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3'
              >
                <div className='flex items-center gap-3'>
                  <span className='text-lg'>
                    {CONNECTION_TYPE_ICONS[conn.type as ConnectionType] ?? '📡'}
                  </span>
                  <div>
                    <p className='font-medium text-gray-900 text-sm'>{conn.name}</p>
                    <div className='flex items-center gap-2 text-gray-500 text-xs'>
                      <span>
                        {CONNECTION_TYPE_I18N_KEYS[conn.type as ConnectionType]
                          ? t(CONNECTION_TYPE_I18N_KEYS[conn.type as ConnectionType])
                          : conn.type}
                      </span>
                      {conn.description && (
                        <>
                          <span>·</span>
                          <span className='line-clamp-1'>{conn.description}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant='default'
                  size='sm'
                  data-testid={`employee-connections:bind:${conn.connectionId}`}
                  disabled={actionLoading === conn.connectionId}
                  onClick={() => handleBind(conn.connectionId)}
                >
                  {actionLoading === conn.connectionId ? (
                    <Loader2 className='h-3.5 w-3.5 animate-spin' />
                  ) : (
                    <Link2 className='h-3.5 w-3.5' />
                  )}
                  {t('employees.knowledgeBind')}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          boundConnections.filter((c) => c.isChannel).length === 0 && (
            <div className='rounded-lg border-2 border-gray-200 border-dashed py-6 text-center'>
              <p className='text-gray-500 text-sm'>{t('channels.noChannels')}</p>
              <p className='mt-1 text-gray-400 text-xs'>{t('channels.noChannelsHint')}</p>
            </div>
          )
        )}
      </div>

      {/* System connections (hidden) */}
      {false && (
        <div>
          <div className='mb-3 flex items-center gap-2'>
            <Link2 className='h-4 w-4 text-gray-500' />
            <h3 className='font-semibold text-gray-900 text-sm'>
              {t('employees.systemConnections')}
            </h3>
          </div>

          {/* Bound system connections */}
          {boundSystemConns.length > 0 && (
            <div className='mb-3 space-y-2'>
              {boundSystemConns.map((conn) => (
                <div
                  key={conn.connectionId}
                  data-testid={`employee-connections:bound:${conn.connectionId}`}
                  className='flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3'
                >
                  <div className='flex items-center gap-3'>
                    <span className='text-lg'>
                      {conn.type === 'database' && conn.config
                        ? getDatabaseDisplayIcon(conn.config)
                        : (CONNECTION_TYPE_ICONS[conn.type as ConnectionType] ?? '🔗')}
                    </span>
                    <div>
                      <p className='font-medium text-gray-900 text-sm'>{conn.name}</p>
                      <div className='flex items-center gap-2 text-gray-500 text-xs'>
                        <span>
                          {conn.type === 'database' && conn.config
                            ? (getDatabaseDisplayLabel(conn.config) ??
                              t('connections.typeDatabase'))
                            : CONNECTION_TYPE_I18N_KEYS[conn.type as ConnectionType]
                              ? t(CONNECTION_TYPE_I18N_KEYS[conn.type as ConnectionType])
                              : conn.type}
                        </span>
                        <span>·</span>
                        <span
                          className={cn(
                            'inline-block h-2 w-2 rounded-full',
                            conn.status === 'connected' && 'bg-green-500',
                            conn.status === 'error' && 'bg-red-500',
                            conn.status === 'disconnected' && 'bg-gray-400'
                          )}
                        />
                        <span>
                          {conn.status === 'connected'
                            ? t('connections.statusConnected')
                            : conn.status === 'error'
                              ? t('connections.statusError')
                              : t('connections.statusDisconnected')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant='outline'
                    size='sm'
                    data-testid={`employee-connections:unbind:${conn.connectionId}`}
                    disabled={actionLoading === conn.connectionId}
                    onClick={() => handleUnbind(conn.connectionId)}
                  >
                    {actionLoading === conn.connectionId ? (
                      <Loader2 className='h-3.5 w-3.5 animate-spin' />
                    ) : (
                      <Link2Off className='h-3.5 w-3.5' />
                    )}
                    {t('employees.knowledgeUnbind')}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Available system connections */}
          {availableSystemConns.length > 0 ? (
            <div className='space-y-2'>
              {availableSystemConns.map((conn) => (
                <div
                  key={conn.connectionId}
                  data-testid={`employee-connections:available:${conn.connectionId}`}
                  className='flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3'
                >
                  <div className='flex items-center gap-3'>
                    <span className='text-lg'>
                      {CONNECTION_TYPE_ICONS[conn.type as ConnectionType] ?? '🔗'}
                    </span>
                    <div>
                      <p className='font-medium text-gray-900 text-sm'>{conn.name}</p>
                      <div className='flex items-center gap-2 text-gray-500 text-xs'>
                        <span>
                          {CONNECTION_TYPE_I18N_KEYS[conn.type as ConnectionType]
                            ? t(CONNECTION_TYPE_I18N_KEYS[conn.type as ConnectionType])
                            : conn.type}
                        </span>
                        {conn.description && (
                          <>
                            <span>·</span>
                            <span className='line-clamp-1'>{conn.description}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant='default'
                    size='sm'
                    data-testid={`employee-connections:bind:${conn.connectionId}`}
                    disabled={actionLoading === conn.connectionId}
                    onClick={() => handleBind(conn.connectionId)}
                  >
                    {actionLoading === conn.connectionId ? (
                      <Loader2 className='h-3.5 w-3.5 animate-spin' />
                    ) : (
                      <Link2 className='h-3.5 w-3.5' />
                    )}
                    {t('employees.knowledgeBind')}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            boundConnections.filter((c) => !c.isChannel).length === 0 && (
              <div className='rounded-lg border-2 border-gray-200 border-dashed py-6 text-center'>
                <p className='text-gray-500 text-sm'>{t('connections.noConnections')}</p>
                <p className='mt-1 text-gray-400 text-xs'>{t('connections.noConnectionsHint')}</p>
              </div>
            )
          )}
        </div>
      )}

      {/* Bind/change model dialog */}
      <Dialog open={modelDialogOpen} onOpenChange={setModelDialogOpen}>
        <DialogContent className='sm:max-w-md' data-testid='dialog:bind-model:container'>
          <DialogHeader>
            <DialogTitle>{t('employees.bindModelTitle')}</DialogTitle>
          </DialogHeader>
          <div className='space-y-4'>
            <div className='relative'>
              <Search className='-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-gray-400' />
              <Input
                data-testid='dialog:bind-model:search'
                placeholder={t('employees.bindModelSearchPlaceholder')}
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                className='pr-8 pl-9'
              />
              {modelSearch && (
                <button
                  className='-translate-y-1/2 absolute top-1/2 right-3 text-gray-400 hover:text-gray-600'
                  onClick={() => setModelSearch('')}
                >
                  <X className='h-4 w-4' />
                </button>
              )}
            </div>

            <div className='max-h-80 space-y-2 overflow-y-auto'>
              {modelsLoading ? (
                <div className='flex h-32 items-center justify-center'>
                  <Loader2 className='h-6 w-6 animate-spin text-gray-400' />
                </div>
              ) : filteredModels.length === 0 ? (
                <div className='py-8 text-center'>
                  <p className='text-gray-500 text-sm'>
                    {availableModels.length === 0
                      ? t('employees.bindModelNoModels')
                      : t('employees.bindModelNoMatch')}
                  </p>
                </div>
              ) : (
                filteredModels.map((model) => {
                  const ProviderIcon = getProviderIcon(model.providerId)
                  return (
                    <div
                      key={model.id}
                      data-testid={`dialog:bind-model:item:${model.id}`}
                      className='flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:bg-gray-50'
                    >
                      <div className='flex items-center gap-3'>
                        <div className='flex h-8 w-8 items-center justify-center rounded-md bg-purple-50'>
                          {ProviderIcon ? (
                            <ProviderIcon className='h-4 w-4 text-purple-600' />
                          ) : (
                            <Brain className='h-4 w-4 text-purple-600' />
                          )}
                        </div>
                        <div>
                          <p className='font-medium text-gray-900 text-sm'>{model.displayName}</p>
                          <div className='flex items-center gap-2 text-gray-500 text-xs'>
                            <span>{model.providerName}</span>
                            {model.modelName && (
                              <>
                                <span>·</span>
                                <span className='font-mono'>{model.modelName}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant='default'
                        size='sm'
                        data-testid={`dialog:bind-model:bind:${model.id}`}
                        disabled={bindingModelId === model.id}
                        onClick={() => handleBindModel(model.id)}
                      >
                        {bindingModelId === model.id ? (
                          <Loader2 className='h-3.5 w-3.5 animate-spin' />
                        ) : (
                          <Link2 className='h-3.5 w-3.5' />
                        )}
                        {t('employees.knowledgeBind')}
                      </Button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

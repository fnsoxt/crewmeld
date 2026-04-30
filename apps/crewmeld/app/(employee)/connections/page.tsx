'use client'

import { useCallback, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import type { ConnectionCardData, ConnectionType } from '@/lib/connectors/types'
import { CONNECTION_TYPE_I18N_KEYS, SYSTEM_CONNECTION_TYPE_LIST } from '@/lib/connectors/types'
import { useTranslation } from '@/hooks/use-translation'
import { usePermissions } from '../hooks/use-permissions'
import { AddConnectionWizard } from './components/add-connection-wizard'
import { ConnectionCard } from './components/connection-card'
import { EditConnectionDialog } from './components/edit-connection-dialog'
import { ModelConfigTab } from './components/model-config-tab'
import { RagflowInlineEditor } from './components/ragflow-inline-editor'
import { useConnections } from './hooks/use-connections'

/** Connection types that only allow one connection (singleton types) */
const SINGLETON_TYPES: ReadonlySet<ConnectionType> = new Set<ConnectionType>(['ragflow'])

type TabKey = ConnectionType | 'models'

export default function ConnectionsPage() {
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission('connector:create')
  const canEdit = hasPermission('connector:edit')
  const canDelete = hasPermission('connector:delete')
  const { t } = useTranslation()

  const TABS: Array<{ key: TabKey; label: string }> = useMemo(
    () => [
      ...SYSTEM_CONNECTION_TYPE_LIST.map((type) => ({
        key: type as TabKey,
        label: t(CONNECTION_TYPE_I18N_KEYS[type] as Parameters<typeof t>[0]),
      })),
      { key: 'models', label: t('connections.tabModels') },
    ],
    [t]
  )

  const STATUS_OPTIONS = [
    { value: 'all', label: t('common.allStatus') },
    { value: 'connected', label: t('connections.statusConnected') },
    { value: 'disconnected', label: t('connections.statusDisconnected') },
    { value: 'error', label: t('connections.statusError') },
  ]
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const tabParam = searchParams?.get('tab')
    const allowed: TabKey[] = [...SYSTEM_CONNECTION_TYPE_LIST, 'models']
    if (tabParam && allowed.includes(tabParam as TabKey)) {
      return tabParam as TabKey
    }
    return SYSTEM_CONNECTION_TYPE_LIST[0]
  })
  const [filterStatus, setFilterStatus] = useState('all')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<ConnectionCardData | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleteLinkedTools, setDeleteLinkedTools] = useState<string[]>([])
  const [singletonAlert, setSingletonAlert] = useState(false)

  const isConnectionTab = activeTab !== 'models'
  const isNonModelsTab = false

  const { connections: allConnections, refetch: refetchAll } = useConnections({})
  const existingTypes = useMemo(() => new Set(allConnections.map((c) => c.type)), [allConnections])

  const {
    connections,
    loading,
    error,
    refetch: refetchFiltered,
  } = useConnections({
    type: isConnectionTab ? activeTab : undefined,
    status: filterStatus,
  })

  const refetch = useCallback(() => {
    refetchFiltered()
    refetchAll()
  }, [refetchFiltered, refetchAll])

  const handleHealthCheck = useCallback(
    async (id: string) => {
      await fetch(`/api/employee/connectors/${id}/health-check`, { method: 'POST' })
      refetch()
    },
    [refetch]
  )

  const handleDelete = useCallback(async (id: string) => {
    setDeleteConfirm(id)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm) return
    try {
      const res = await fetch(`/api/employee/connectors/${deleteConfirm}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.linkedToolCount > 0) {
        setDeleteLinkedTools(data.linkedToolInstances ?? [])
      }
      refetch()
    } finally {
      setDeleteConfirm(null)
    }
  }, [deleteConfirm, refetch])

  return (
    <div>
      {/* Page header */}
      <div className='mb-6'>
        <h1 className='font-bold text-2xl text-gray-900'>{t('connections.title')}</h1>
        <p className='mt-1 text-gray-500 text-sm'>{t('connections.subtitle')}</p>
      </div>

      {/* Tab switcher */}
      <div className='mb-6 flex border-gray-200 border-b'>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              activeTab === tab.key
                ? 'border-blue-600 border-b-2 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: ragflow - inline editor (singleton, no card list needed) */}
      {activeTab === 'ragflow' && (
        <RagflowInlineEditor
          connection={connections.length > 0 ? connections[0] : null}
          loading={loading}
          canEdit={canEdit}
          canCreate={canCreate && !isNonModelsTab}
          canDelete={canDelete}
          onRefetch={refetch}
        />
      )}

      {/* Tab: connections (non-ragflow types) */}
      {isConnectionTab && activeTab !== 'ragflow' && (
        <>
          {/* Filters + Add button */}
          <div className='mb-6 flex items-center justify-between'>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className='rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-700 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {canCreate && (
              <Button
                size='sm'
                data-testid={`connection-list:add:${activeTab}`}
                disabled={isNonModelsTab}
                title={isNonModelsTab ? t('common.comingInP1') : undefined}
                onClick={() => {
                  if (isNonModelsTab) return
                  const tabType = activeTab as ConnectionType
                  if (SINGLETON_TYPES.has(tabType) && existingTypes.has(tabType)) {
                    setSingletonAlert(true)
                    return
                  }
                  setWizardOpen(true)
                }}
              >
                <Plus className='mr-1 h-4 w-4' />
                {t('connections.addConnection')}
              </Button>
            )}
          </div>

          {error && (
            <div className='mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-600 text-sm'>
              {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className='h-48 animate-pulse rounded-xl border border-gray-200 bg-gray-100'
                />
              ))}
            </div>
          )}

          {/* Connection grid */}
          {!loading && connections.length > 0 && (
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
              {connections.map((conn) => (
                <ConnectionCard
                  key={conn.id}
                  connection={conn}
                  isAdmin={canEdit || canDelete}
                  onEdit={setEditingConnection}
                  onDelete={handleDelete}
                  onHealthCheck={handleHealthCheck}
                />
              ))}
            </div>
          )}

          {/* Add wizard */}
          <AddConnectionWizard
            open={wizardOpen}
            onOpenChange={setWizardOpen}
            onCreated={refetch}
            existingTypes={existingTypes}
            preselectedType={activeTab as ConnectionType}
          />

          {/* Edit dialog */}
          <EditConnectionDialog
            connection={editingConnection}
            onOpenChange={(open) => {
              if (!open) setEditingConnection(null)
            }}
            onUpdated={refetch}
          />

          {/* Delete confirmation */}
          {deleteConfirm && (
            <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
              <div className='w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl'>
                <h3 className='mb-2 font-semibold text-gray-900 text-lg'>
                  {t('common.confirmDelete')}
                </h3>
                <p className='mb-4 text-gray-500 text-sm'>{t('connections.confirmDeleteDesc')}</p>
                <div className='flex justify-end gap-2'>
                  <Button variant='outline' onClick={() => setDeleteConfirm(null)}>
                    {t('common.cancel')}
                  </Button>
                  <Button variant='destructive' onClick={confirmDelete}>
                    {t('common.confirmDelete')}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Linked tools warning after deletion */}
          {deleteLinkedTools.length > 0 && (
            <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
              <div className='w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl'>
                <h3 className='mb-2 font-semibold text-amber-600 text-lg'>
                  {t('connections.linkedToolsWarningTitle')}
                </h3>
                <p className='mb-2 text-gray-500 text-sm'>
                  {t('connections.linkedToolsWarningDesc')}
                </p>
                <ul className='mb-4 list-disc pl-5 text-gray-700 text-sm'>
                  {deleteLinkedTools.map((name, i) => (
                    <li key={i}>{name}</li>
                  ))}
                </ul>
                <div className='flex justify-end'>
                  <Button variant='outline' onClick={() => setDeleteLinkedTools([])}>
                    {t('common.confirm')}
                  </Button>
                </div>
              </div>
            </div>
          )}
          {/* Singleton type restriction notice */}
          {singletonAlert && (
            <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
              <div className='w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl'>
                <h3 className='mb-2 font-semibold text-amber-600 text-lg'>
                  {t('connections.singletonAlertTitle')}
                </h3>
                <p className='mb-4 text-gray-500 text-sm'>{t('connections.singletonAlertDesc')}</p>
                <div className='flex justify-end'>
                  <Button variant='outline' onClick={() => setSingletonAlert(false)}>
                    {t('common.confirm')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Tab: models */}
      {activeTab === 'models' && <ModelConfigTab isAdmin={hasPermission('model:create')} />}
    </div>
  )
}

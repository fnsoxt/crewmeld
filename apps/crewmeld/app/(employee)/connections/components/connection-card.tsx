'use client'

import { useState } from 'react'
import { Loader2, MoreVertical, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ConnectionCardData, ConnectionStatus } from '@/lib/connectors/types'
import {
  CONNECTION_TYPE_I18N_KEYS,
  CONNECTION_TYPE_ICONS,
  getDatabaseDisplayIcon,
  getDatabaseDisplayLabel,
} from '@/lib/connectors/types'
import { cn } from '@/lib/core/utils/cn'
import { renderHealthMessage } from '@/lib/i18n/render-health-message'
import { useTranslation } from '@/hooks/use-translation'

interface ConnectionCardProps {
  connection: ConnectionCardData
  isAdmin?: boolean
  onEdit: (connection: ConnectionCardData) => void
  onDelete: (id: string) => void
  onHealthCheck: (id: string) => Promise<void>
}

export function ConnectionCard({
  connection,
  isAdmin = true,
  onEdit,
  onDelete,
  onHealthCheck,
}: ConnectionCardProps) {
  const { t } = useTranslation()
  const STATUS_LABELS: Record<ConnectionStatus, string> = {
    connected: t('connections.statusConnected'),
    disconnected: t('connections.statusDisconnected'),
    error: t('connections.statusError'),
    testing: t('connections.statusTesting'),
  }
  const [isChecking, setIsChecking] = useState(false)
  const [showActions, setShowActions] = useState(false)

  const handleHealthCheck = async () => {
    setIsChecking(true)
    try {
      await onHealthCheck(connection.id)
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <div className='relative rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md'>
      <div className='mb-4 flex items-start justify-between'>
        <div className='flex items-center gap-3'>
          <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-xl'>
            {connection.type === 'database'
              ? getDatabaseDisplayIcon(connection.config)
              : (CONNECTION_TYPE_ICONS[connection.type] ?? '🔗')}
          </div>
          <div>
            <h3 className='font-semibold text-gray-900 text-sm'>{connection.name}</h3>
            <p className='text-gray-500 text-xs'>
              {connection.type === 'database'
                ? (getDatabaseDisplayLabel(connection.config) ?? t('connections.typeDatabase'))
                : CONNECTION_TYPE_I18N_KEYS[connection.type]
                  ? t(CONNECTION_TYPE_I18N_KEYS[connection.type] as Parameters<typeof t>[0])
                  : connection.type}
            </p>
          </div>
        </div>

        {isAdmin && (
          <div className='relative'>
            <Button
              variant='ghost'
              size='icon'
              className='h-8 w-8'
              onClick={() => setShowActions(!showActions)}
            >
              <MoreVertical className='h-4 w-4' />
            </Button>
            {showActions && (
              <>
                <div className='fixed inset-0 z-10' onClick={() => setShowActions(false)} />
                <div className='absolute right-0 z-20 mt-1 w-32 rounded-lg border border-gray-200 bg-white py-1 shadow-lg'>
                  <button
                    onClick={() => {
                      setShowActions(false)
                      onEdit(connection)
                    }}
                    className='flex w-full items-center gap-2 px-3 py-2 text-gray-700 text-sm hover:bg-gray-50'
                  >
                    <Pencil className='h-3.5 w-3.5' />
                    {t('common.edit')}
                  </button>
                  <button
                    onClick={() => {
                      setShowActions(false)
                      onDelete(connection.id)
                    }}
                    className='flex w-full items-center gap-2 px-3 py-2 text-red-600 text-sm hover:bg-red-50'
                  >
                    <Trash2 className='h-3.5 w-3.5' />
                    {t('common.delete')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {connection.description && (
        <p className='mb-3 line-clamp-2 text-gray-500 text-xs'>{connection.description}</p>
      )}

      <div className='mb-4 flex items-center gap-2'>
        <span
          className={cn(
            'inline-block h-2.5 w-2.5 rounded-full',
            connection.status === 'connected' && 'bg-green-500',
            connection.status === 'error' && 'bg-red-500',
            connection.status === 'testing' && 'animate-pulse bg-yellow-500',
            connection.status === 'disconnected' && 'bg-gray-400'
          )}
        />
        <span className='text-gray-600 text-xs'>
          {STATUS_LABELS[connection.status] ?? connection.status}
        </span>
        {connection.lastHealthCheck && (
          <span className='text-gray-400 text-xs'>
            ·{' '}
            {t('connections.lastCheck', {
              date: new Date(connection.lastHealthCheck).toLocaleString(),
            })}
          </span>
        )}
      </div>

      {connection.status === 'error' &&
        renderHealthMessage(connection.lastHealthMessageI18n, t) && (
          <div className='mb-3 rounded-lg bg-red-50 px-3 py-2 text-red-600 text-xs'>
            {renderHealthMessage(connection.lastHealthMessageI18n, t)}
          </div>
        )}

      <div className={isAdmin ? 'flex gap-2' : ''}>
        {isAdmin && (
          <Button variant='outline' size='sm' className='flex-1' onClick={() => onEdit(connection)}>
            <Pencil className='h-3.5 w-3.5' />
            {t('common.edit')}
          </Button>
        )}
        <Button
          variant='outline'
          size='sm'
          className={isAdmin ? 'flex-1' : 'w-full'}
          disabled={isChecking}
          onClick={handleHealthCheck}
        >
          {isChecking ? (
            <>
              <Loader2 className='h-3.5 w-3.5 animate-spin' />
              {t('connections.testingEllipsis')}
            </>
          ) : (
            <>
              <RefreshCw className='h-3.5 w-3.5' />
              {t('connections.checkNow')}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Loader2, MoreVertical, Pencil, RefreshCw, Trash2, UserCheck } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import type { ConnectionType } from '@/lib/connectors/types'
import { CONNECTION_TYPE_I18N_KEYS } from '@/lib/connectors/types'
import { cn } from '@/lib/core/utils/cn'
import { renderHealthMessage } from '@/lib/i18n/render-health-message'
import { useTranslation } from '@/hooks/use-translation'
import type { ChannelRecord } from '../hooks/use-channels'
import { ChannelTypeIcon } from './channel-type-icon'

interface ChannelCardProps {
  channel: ChannelRecord
  isNotificationBot: boolean
  onEdit: (channel: ChannelRecord) => void
  onDelete: (id: string) => Promise<void>
  onTest: (id: string) => Promise<void>
  onSetNotificationBot: (id: string) => Promise<void>
}

export function ChannelCard({
  channel,
  isNotificationBot,
  onEdit,
  onDelete,
  onTest,
  onSetNotificationBot,
}: ChannelCardProps) {
  const { t } = useTranslation()
  const STATUS_LABELS: Record<string, string> = {
    connected: t('channels.statusConnected'),
    disconnected: t('channels.statusDisconnected'),
    error: t('channels.statusError'),
    testing: t('channels.testing'),
  }
  const [isTesting, setIsTesting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSetting, setIsSetting] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const handleSetBot = async () => {
    setIsSetting(true)
    try {
      await onSetNotificationBot(channel.id)
    } finally {
      setIsSetting(false)
    }
  }

  const handleTest = async () => {
    setIsTesting(true)
    try {
      await onTest(channel.id)
    } finally {
      setIsTesting(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await onDelete(channel.id)
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
    }
  }

  const typeKey = channel.type as ConnectionType

  return (
    <>
      <div
        data-testid={`channel-list:card:${channel.id}`}
        className='relative rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md'
      >
        <div className='mb-4 flex items-start justify-between'>
          <div className='flex items-center gap-3'>
            <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100'>
              <ChannelTypeIcon type={typeKey} size={28} />
            </div>
            <div>
              <h3 className='font-semibold text-gray-900 text-sm'>{channel.name}</h3>
              <p className='text-gray-500 text-xs'>
                {CONNECTION_TYPE_I18N_KEYS[typeKey]
                  ? t(CONNECTION_TYPE_I18N_KEYS[typeKey])
                  : channel.type}
              </p>
            </div>
          </div>

          <div className='flex items-center gap-1'>
            <button
              type='button'
              onClick={handleSetBot}
              disabled={isSetting || isNotificationBot}
              className={cn(
                'flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
                isNotificationBot
                  ? 'cursor-default bg-green-50 text-green-600'
                  : 'text-gray-400 hover:bg-violet-50 hover:text-violet-600'
              )}
              title={
                isNotificationBot ? t('channels.notificationBot') : t('channels.setNotificationBot')
              }
              data-testid={`channel-card:set-bot:${channel.id}`}
            >
              {isSetting ? (
                <Loader2 className='h-3.5 w-3.5 animate-spin' />
              ) : (
                <UserCheck className='h-3.5 w-3.5' />
              )}
              {isNotificationBot ? t('channels.notificationActive') : t('channels.notification')}
            </button>
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
                        onEdit(channel)
                      }}
                      className='flex w-full items-center gap-2 px-3 py-2 text-gray-700 text-sm hover:bg-gray-50'
                    >
                      <Pencil className='h-3.5 w-3.5' />
                      {t('common.edit')}
                    </button>
                    <button
                      data-testid={`channel-card:delete:${channel.id}`}
                      onClick={() => {
                        setShowActions(false)
                        setDeleteDialogOpen(true)
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
          </div>
        </div>

        {channel.description && (
          <p className='mb-3 line-clamp-2 text-gray-500 text-xs'>{channel.description}</p>
        )}

        <div className='mb-4 flex items-center gap-2'>
          <span
            className={cn(
              'inline-block h-2.5 w-2.5 rounded-full',
              channel.status === 'connected' && 'bg-green-500',
              channel.status === 'error' && 'bg-red-500',
              channel.status === 'testing' && 'animate-pulse bg-yellow-500',
              channel.status === 'disconnected' && 'bg-gray-400'
            )}
          />
          <span className='text-gray-600 text-xs'>
            {STATUS_LABELS[channel.status] ?? channel.status}
          </span>
          {channel.lastHealthCheck && (
            <span className='text-gray-400 text-xs'>
              ·{' '}
              {t('channels.lastCheck', {
                date: new Date(channel.lastHealthCheck).toLocaleString(),
              })}
            </span>
          )}
        </div>

        {channel.status === 'error' && renderHealthMessage(channel.lastHealthMessageI18n, t) && (
          <div className='mb-3 rounded-lg bg-red-50 px-3 py-2 text-red-600 text-xs'>
            {renderHealthMessage(channel.lastHealthMessageI18n, t)}
          </div>
        )}

        <div className='flex gap-2'>
          <Button variant='outline' size='sm' className='flex-1' onClick={() => onEdit(channel)}>
            <Pencil className='h-3.5 w-3.5' />
            {t('common.edit')}
          </Button>
          <Button
            variant='outline'
            size='sm'
            className='flex-1'
            disabled={isTesting}
            onClick={handleTest}
            data-testid={`channel-card:test:${channel.id}`}
          >
            {isTesting ? (
              <>
                <Loader2 className='h-3.5 w-3.5 animate-spin' />
                {t('channels.testingEllipsis')}
              </>
            ) : (
              <>
                <RefreshCw className='h-3.5 w-3.5' />
                {t('connections.testConnection')}
              </>
            )}
          </Button>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('channels.confirmDeleteDesc', { name: channel.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid='dialog:delete-channel:cancel'>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid='dialog:delete-channel:confirm'
              className='bg-red-600 hover:bg-red-700'
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
              {t('common.confirmDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

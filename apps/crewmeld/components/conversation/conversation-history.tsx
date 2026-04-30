'use client'

import { useEffect, useState } from 'react'
import { MessageSquare, Plus, Trash2 } from 'lucide-react'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/core/utils/cn'
import type { SupportedLocale } from '@/lib/core/utils/formatting'
import { formatRelativeTimeI18n } from '@/lib/core/utils/formatting'
import { useTranslation } from '@/hooks/use-translation'
import { useConversationStore } from '@/stores/conversation/store'

interface ConversationHistoryProps {
  employeeId: string
}

export function ConversationHistory({ employeeId }: ConversationHistoryProps) {
  const { t, locale } = useTranslation()
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const {
    conversations,
    activeConversationId,
    loadConversations,
    loadMessages,
    createConversation,
    setActiveConversation,
    closeConversation,
  } = useConversationStore()

  useEffect(() => {
    loadConversations(employeeId)
  }, [employeeId, loadConversations])

  const handleNewConversation = async () => {
    const id = await createConversation(employeeId)
    if (id) {
      loadMessages(id)
    }
  }

  const handleSelect = (conversationId: string) => {
    setActiveConversation(conversationId)
    loadMessages(conversationId)
  }

  const filteredConversations = conversations.filter(
    (c) => c.employeeId === employeeId && (c.messageCount > 0 || c.id === activeConversationId)
  )

  return (
    <div className='flex h-full flex-col border-gray-200 border-r bg-gray-50'>
      <div className='flex items-center justify-between border-gray-200 border-b px-4 py-3'>
        <h3 className='font-medium text-gray-700 text-sm'>{t('conversation.historyTitle')}</h3>
        <Button
          data-testid='chat:new-conversation'
          variant='ghost'
          size='icon'
          className='h-7 w-7'
          onClick={handleNewConversation}
        >
          <Plus className='h-4 w-4' />
        </Button>
      </div>

      <ScrollArea className='[&>div>div]:!block flex-1'>
        <div className='space-y-1 p-2'>
          {filteredConversations.length === 0 && (
            <div className='px-3 py-8 text-center text-gray-400 text-xs'>
              {t('conversation.historyEmpty')}
            </div>
          )}
          {filteredConversations.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                'group flex w-full items-start gap-2 overflow-hidden rounded-lg px-3 py-2 transition-colors',
                activeConversationId === conv.id
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              <button
                data-testid={`chat:history:${conv.id}`}
                onClick={() => handleSelect(conv.id)}
                className='flex min-w-0 flex-1 items-start gap-2 text-left'
              >
                <MessageSquare className='mt-0.5 h-3.5 w-3.5 shrink-0' />
                <div className='min-w-0 flex-1'>
                  <p className='truncate font-medium text-xs'>
                    {conv.title ?? t('conversation.defaultTitle')}
                  </p>
                  <p className='mt-0.5 text-[10px] text-gray-400'>
                    {t('conversation.messageCount', { count: conv.messageCount })}
                    {conv.lastMessageAt &&
                      ` · ${formatRelativeTimeI18n(conv.lastMessageAt, locale as SupportedLocale)}`}
                  </p>
                </div>
              </button>
              <button
                data-testid={`chat:history:delete:${conv.id}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setDeleteTargetId(conv.id)
                }}
                className='mt-0.5 shrink-0 rounded p-0.5 text-gray-300 transition-opacity hover:bg-red-100 hover:text-red-500 max-md:opacity-100 md:opacity-0 md:group-hover:opacity-100'
              >
                <Trash2 className='h-3 w-3' />
              </button>
            </div>
          ))}
        </div>
      </ScrollArea>

      <AlertDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('conversations.confirmDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('conversations.confirmDeleteDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid='dialog:delete-conversation:cancel'>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid='dialog:delete-conversation:confirm'
              className='bg-red-600 hover:bg-red-700'
              onClick={() => {
                if (deleteTargetId) {
                  closeConversation(deleteTargetId)
                  setDeleteTargetId(null)
                }
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

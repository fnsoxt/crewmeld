'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ChevronUp,
  Globe,
  Loader2,
  Mail,
  MessageCircle,
  MessagesSquare,
  Phone,
  Send,
  Trash2,
  Webhook,
} from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { MessageBubble } from '@/components/conversation/message-bubble'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/core/utils/cn'
import type { SupportedLocale } from '@/lib/core/utils/formatting'
import { formatDateTimeShortI18n, formatRelativeTimeI18n } from '@/lib/core/utils/formatting'
import { useTranslation } from '@/hooks/use-translation'

/* ---------- types ---------- */

interface HistoryConversation {
  id: string
  employeeId: string
  userId: string
  channel: 'web' | 'wecom' | 'dingtalk' | 'feishu' | 'api' | 'telegram' | 'discord' | 'wxoa'
  status: string
  title: string | null
  messageCount: number
  totalTokens: number
  lastMessageAt: string | null
  createdAt: string
  externalUserId: string | null
  externalSessionId: string | null
  channelMetadata: Record<string, unknown> | null
  senderName: string | null
  preview: string | null
}

interface HistoryMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | null
  createdAt: string
  metadata?: { files?: Array<{ key: string; name: string; size: number; mimeType: string }> }
}

interface EmployeeInfo {
  id: string
  name: string
  avatar: string | null
}

/* ---------- channel config ---------- */

const CHANNEL_ICONS: Record<string, { icon: typeof Globe; className: string }> = {
  web: { icon: Globe, className: 'bg-blue-100 text-blue-700' },
  feishu: { icon: Send, className: 'bg-purple-100 text-purple-700' },
  dingtalk: { icon: Phone, className: 'bg-sky-100 text-sky-700' },
  wecom: { icon: MessagesSquare, className: 'bg-green-100 text-green-700' },
  telegram: { icon: Send, className: 'bg-cyan-100 text-cyan-700' },
  discord: { icon: MessageCircle, className: 'bg-indigo-100 text-indigo-700' },
  wxoa: { icon: MessagesSquare, className: 'bg-emerald-100 text-emerald-700' },
  email: { icon: Mail, className: 'bg-orange-100 text-orange-700' },
  api: { icon: Webhook, className: 'bg-gray-100 text-gray-700' },
}

const CHANNEL_LABELS: Record<string, string> = {
  web: 'Web',
  api: 'API',
}

const PAGE_SIZE = 50
const MSG_PAGE_SIZE = 50

/* ---------- page ---------- */

export default function ConversationHistoryPage() {
  const { t, locale } = useTranslation()
  const params = useParams()
  const router = useRouter()
  const employeeId = params.employeeId as string

  const CHANNEL_LABEL_KEYS: Record<string, string> = {
    feishu: t('conversations.channelFeishu'),
    dingtalk: t('conversations.channelDingtalk'),
    wecom: t('conversations.channelWecom'),
    wxoa: t('conversations.channelWxoa'),
  }
  const channelLabel = (ch: string) => CHANNEL_LABELS[ch] ?? CHANNEL_LABEL_KEYS[ch] ?? ch

  const [employee, setEmployee] = useState<EmployeeInfo | null>(null)
  const [historyList, setHistoryList] = useState<HistoryConversation[]>([])
  const [channelStats, setChannelStats] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [channelFilter, setChannelFilter] = useState<string>('all')
  const [hasMoreConvs, setHasMoreConvs] = useState(false)
  const [isLoadingMoreConvs, setIsLoadingMoreConvs] = useState(false)

  // Selected conversation
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<HistoryMessage[]>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [isLoadingMoreMsgs, setIsLoadingMoreMsgs] = useState(false)
  const [msgCursor, setMsgCursor] = useState<string | null>(null)

  // Delete confirmation dialog
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  // Toast
  const [toast, setToast] = useState<{ type: 'error' | 'success'; message: string } | null>(null)
  const showToast = useCallback((type: 'error' | 'success', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }, [])

  // Message scroll container - for restoring scroll position after loading earlier messages
  const msgScrollRef = useRef<HTMLDivElement>(null)
  const msgViewportRef = useRef<HTMLDivElement | null>(null)

  /* Load history list (first page) */
  const fetchHistory = useCallback(async () => {
    setIsLoading(true)
    try {
      const queryParams = new URLSearchParams({ employeeId, limit: String(PAGE_SIZE) })
      if (channelFilter !== 'all') queryParams.append('channel', channelFilter)

      const res = await fetch(`/api/employee/conversations/history?${queryParams}`)
      const json = await res.json()
      if (json.success) {
        setHistoryList(json.data)
        setEmployee(json.employee)
        setChannelStats(json.channelStats ?? {})
        setHasMoreConvs(json.hasMore ?? false)
      } else {
        showToast('error', json.error ?? t('conversations.loadFailed'))
      }
    } catch {
      showToast('error', t('conversations.networkError'))
    } finally {
      setIsLoading(false)
    }
  }, [employeeId, channelFilter, showToast])

  /* When switching channel filter: clear selection + reload */
  const handleChannelFilterChange = useCallback((value: string) => {
    setChannelFilter(value)
    setSelectedId(null)
    setMessages([])
    setHasMoreMessages(false)
    setMsgCursor(null)
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  /* Load more conversations */
  const loadMoreConvs = useCallback(async () => {
    if (isLoadingMoreConvs || !hasMoreConvs) return
    setIsLoadingMoreConvs(true)
    try {
      const queryParams = new URLSearchParams({
        employeeId,
        limit: String(PAGE_SIZE),
        offset: String(historyList.length),
      })
      if (channelFilter !== 'all') queryParams.append('channel', channelFilter)

      const res = await fetch(`/api/employee/conversations/history?${queryParams}`)
      const json = await res.json()
      if (json.success) {
        setHistoryList((prev) => [...prev, ...json.data])
        setHasMoreConvs(json.hasMore ?? false)
      } else {
        showToast('error', json.error ?? t('conversations.loadMoreFailed'))
      }
    } catch {
      showToast('error', t('conversations.networkErrorMore'))
    } finally {
      setIsLoadingMoreConvs(false)
    }
  }, [employeeId, channelFilter, historyList.length, hasMoreConvs, isLoadingMoreConvs, showToast])

  /* Load messages for conversation (first page) */
  const loadMessages = useCallback(
    async (conversationId: string) => {
      setSelectedId(conversationId)
      setIsLoadingMessages(true)
      setHasMoreMessages(false)
      setMsgCursor(null)
      try {
        const res = await fetch(
          `/api/employee/conversations/${conversationId}/messages?limit=${MSG_PAGE_SIZE}`
        )
        const json = await res.json()
        if (json.success) {
          setMessages(json.data)
          setHasMoreMessages(json.hasMore ?? false)
          setMsgCursor(json.nextCursor ?? null)
        } else {
          showToast('error', json.error ?? t('conversations.loadMessagesFailed'))
        }
      } catch {
        showToast('error', t('conversations.networkErrorMessages'))
      } finally {
        setIsLoadingMessages(false)
      }
    },
    [showToast]
  )

  /* Load earlier messages (restore scroll after insert at top) */
  const loadMoreMessages = useCallback(async () => {
    if (isLoadingMoreMsgs || !hasMoreMessages || !selectedId || !msgCursor) return
    setIsLoadingMoreMsgs(true)

    // Remember scroll height before loading
    const viewport = msgViewportRef.current
    const prevScrollHeight = viewport?.scrollHeight ?? 0

    try {
      const res = await fetch(
        `/api/employee/conversations/${selectedId}/messages?limit=${MSG_PAGE_SIZE}&before=${msgCursor}`
      )
      const json = await res.json()
      if (json.success) {
        setMessages((prev) => [...json.data, ...prev])
        setHasMoreMessages(json.hasMore ?? false)
        setMsgCursor(json.nextCursor ?? null)

        // Restore scroll after DOM update: height diff = new scrollHeight - old scrollHeight
        requestAnimationFrame(() => {
          if (viewport) {
            const newScrollHeight = viewport.scrollHeight
            viewport.scrollTop += newScrollHeight - prevScrollHeight
          }
        })
      } else {
        showToast('error', json.error ?? t('conversations.loadMoreMessagesFailed'))
      }
    } catch {
      showToast('error', t('conversations.networkErrorMoreMessages'))
    } finally {
      setIsLoadingMoreMsgs(false)
    }
  }, [selectedId, msgCursor, hasMoreMessages, isLoadingMoreMsgs, showToast])

  /* Confirm conversation deletion */
  const confirmDelete = useCallback(async () => {
    if (!deleteTargetId) return
    const conversationId = deleteTargetId
    setDeleteTargetId(null)
    try {
      const res = await fetch(`/api/employee/conversations/${conversationId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        showToast('error', t('conversations.deleteFailed'))
        return
      }
      setHistoryList((prev) => prev.filter((c) => c.id !== conversationId))
      if (selectedId === conversationId) {
        setSelectedId(null)
        setMessages([])
        setHasMoreMessages(false)
        setMsgCursor(null)
      }
      showToast('success', t('conversations.deleteSuccess'))
    } catch {
      showToast('error', t('conversations.networkErrorDelete'))
    }
  }, [deleteTargetId, selectedId, showToast])

  /* ---------- render ---------- */

  if (isLoading) {
    return (
      <div className='flex h-[calc(100vh-48px)] items-center justify-center'>
        <Loader2 className='h-6 w-6 animate-spin text-gray-400' />
      </div>
    )
  }

  const selectedConv = historyList.find((c) => c.id === selectedId)
  const visibleMessages = messages.filter((m) => m.role === 'user' || m.role === 'assistant')

  return (
    <div className='flex h-[calc(100vh-48px)] flex-col'>
      {/* Toast */}
      {toast && (
        <div
          className={cn(
            '-translate-x-1/2 fixed top-16 left-1/2 z-50 flex items-center gap-3 rounded-xl border px-5 py-3 shadow-lg',
            toast.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-green-200 bg-green-50 text-green-800'
          )}
        >
          <AlertCircle className='h-4 w-4 shrink-0' />
          <span className='font-medium text-sm'>{toast.message}</span>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null)
        }}
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
              onClick={confirmDelete}
              className='bg-red-600 hover:bg-red-700'
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <div className='flex items-center gap-3 border-gray-200 border-b bg-white px-4 py-3'>
        <Button
          data-testid='chat:history:back'
          variant='ghost'
          size='icon'
          className='h-8 w-8'
          onClick={() => router.push('/conversations')}
        >
          <ArrowLeft className='h-4 w-4' />
        </Button>
        {employee && (
          <>
            <div className='flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 font-medium text-blue-600 text-sm'>
              {employee.avatar ?? employee.name.slice(0, 1)}
            </div>
            <span className='font-medium text-gray-900 text-sm'>{employee.name}</span>
          </>
        )}
        <span className='text-gray-400 text-sm'>{t('conversations.historyTitle')}</span>

        {/* Channel filter */}
        <div className='ml-auto'>
          <Select value={channelFilter} onValueChange={handleChannelFilterChange}>
            <SelectTrigger
              data-testid='chat:history:filter:channel'
              className='h-8 w-[130px] text-xs'
            >
              <SelectValue placeholder={t('conversations.allChannels')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{t('conversations.allChannels')}</SelectItem>
              <SelectItem value='web'>Web</SelectItem>
              <SelectItem value='feishu'>{t('conversations.channelFeishu')}</SelectItem>
              <SelectItem value='dingtalk'>{t('conversations.channelDingtalk')}</SelectItem>
              <SelectItem value='wecom'>{t('conversations.channelWecom')}</SelectItem>
              <SelectItem value='telegram'>{t('conversations.channelTelegram')}</SelectItem>
              <SelectItem value='discord'>{t('conversations.channelDiscord')}</SelectItem>
              <SelectItem value='email'>{t('conversations.channelEmail')}</SelectItem>
              <SelectItem value='wxoa'>{t('conversations.channelWxoa')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Body */}
      <div className='flex flex-1 overflow-hidden'>
        {/* Left: conversation list - hidden on mobile when selected */}
        <div
          className={cn(
            'w-full shrink-0 border-gray-200 border-r bg-gray-50 md:w-80',
            selectedId ? 'hidden md:block' : 'block'
          )}
        >
          {/* Channel stats */}
          {Object.keys(channelStats).length > 0 && (
            <div className='flex flex-wrap gap-1.5 border-gray-200 border-b px-4 py-2.5'>
              {Object.entries(channelStats).map(([ch, count]) => {
                const cfg = CHANNEL_ICONS[ch]
                return (
                  <Badge key={ch} variant='outline' className={cn('text-[10px]', cfg?.className)}>
                    {channelLabel(ch)} {count}
                  </Badge>
                )
              })}
            </div>
          )}

          <ScrollArea className='[&>div>div]:!block h-[calc(100%-3rem)]'>
            <div className='space-y-1 p-2'>
              {historyList.length === 0 && (
                <div className='px-3 py-12 text-center text-gray-400 text-sm'>
                  {t('conversations.noHistory')}
                </div>
              )}
              {historyList.map((conv) => {
                const chCfg = CHANNEL_ICONS[conv.channel]
                const ChIcon = chCfg?.icon ?? Globe
                return (
                  <div
                    key={conv.id}
                    className={cn(
                      'group flex w-full items-start gap-3 overflow-hidden rounded-lg px-3 py-2.5 transition-colors',
                      selectedId === conv.id
                        ? 'bg-blue-50 ring-1 ring-blue-200'
                        : 'hover:bg-gray-100'
                    )}
                  >
                    <button
                      data-testid={`chat:history:item:${conv.id}`}
                      onClick={() => loadMessages(conv.id)}
                      className='flex min-w-0 flex-1 items-start gap-3 text-left'
                    >
                      <div
                        className={cn(
                          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                          chCfg?.className ?? 'bg-gray-100 text-gray-600'
                        )}
                      >
                        <ChIcon className='h-3.5 w-3.5' />
                      </div>
                      <div className='min-w-0 flex-1'>
                        <div className='flex min-w-0 items-center gap-2'>
                          <span className='min-w-0 truncate font-medium text-gray-900 text-xs'>
                            {conv.title ?? t('conversations.defaultTitle')}
                          </span>
                          <Badge variant='outline' className='shrink-0 text-[10px]'>
                            {channelLabel(conv.channel)}
                          </Badge>
                        </div>
                        {(conv.senderName || conv.externalUserId) && (
                          <p className='mt-0.5 truncate text-[10px] text-gray-500'>
                            {t('conversations.userLabel', {
                              name: conv.senderName ?? conv.externalUserId ?? '',
                            })}
                          </p>
                        )}
                        {conv.preview && (
                          <p className='mt-0.5 truncate text-[11px] text-gray-400'>
                            {conv.preview}
                          </p>
                        )}
                        <div className='mt-1 flex items-center gap-2 text-[10px] text-gray-400'>
                          <span>
                            {t('conversations.messageCount', { count: conv.messageCount })}
                          </span>
                          {conv.lastMessageAt && (
                            <span>
                              {formatRelativeTimeI18n(
                                conv.lastMessageAt,
                                locale as SupportedLocale
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                    <button
                      data-testid={`chat:history:delete:${conv.id}`}
                      title={t('common.delete')}
                      onClick={() => setDeleteTargetId(conv.id)}
                      className='mt-1 shrink-0 rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-500'
                    >
                      <Trash2 className='h-3.5 w-3.5' />
                    </button>
                  </div>
                )
              })}

              {/* Load more conversations */}
              {hasMoreConvs && (
                <div className='px-3 py-2 text-center'>
                  <Button
                    data-testid='chat:history:load-more-convs'
                    variant='ghost'
                    size='sm'
                    className='h-7 text-gray-500 text-xs'
                    disabled={isLoadingMoreConvs}
                    onClick={loadMoreConvs}
                  >
                    {isLoadingMoreConvs ? (
                      <Loader2 className='mr-1.5 h-3 w-3 animate-spin' />
                    ) : null}
                    {isLoadingMoreConvs ? t('common.loading') : t('conversations.loadMore')}
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right: message details - hidden on mobile when none selected */}
        <div
          className={cn('flex flex-1 flex-col bg-white', !selectedId ? 'hidden md:flex' : 'flex')}
        >
          {!selectedId ? (
            <div className='flex flex-1 flex-col items-center justify-center text-gray-400'>
              <MessageCircle className='mb-3 h-12 w-12 text-gray-200' />
              <p className='text-sm'>{t('conversations.selectConversation')}</p>
            </div>
          ) : isLoadingMessages ? (
            <div className='flex flex-1 items-center justify-center'>
              <Loader2 className='h-5 w-5 animate-spin text-gray-400' />
            </div>
          ) : (
            <>
              {/* Conversation info header */}
              {selectedConv && (
                <div className='flex items-center gap-3 border-gray-100 border-b px-4 py-2.5'>
                  {/* Mobile: back to conversation list */}
                  <Button
                    variant='ghost'
                    size='icon'
                    className='h-7 w-7 md:hidden'
                    onClick={() => {
                      setSelectedId(null)
                      setMessages([])
                      setHasMoreMessages(false)
                      setMsgCursor(null)
                    }}
                  >
                    <ArrowLeft className='h-4 w-4' />
                  </Button>
                  <Badge
                    variant='outline'
                    className={cn('text-xs', CHANNEL_ICONS[selectedConv.channel]?.className)}
                  >
                    {channelLabel(selectedConv.channel)}
                  </Badge>
                  {(selectedConv.senderName || selectedConv.externalUserId) && (
                    <span className='text-gray-500 text-xs'>
                      {t('conversations.userLabel', {
                        name: selectedConv.senderName ?? selectedConv.externalUserId ?? '',
                      })}
                    </span>
                  )}
                  <span className='text-gray-400 text-xs'>
                    {t('conversations.messageCount', { count: selectedConv.messageCount })}
                  </span>
                  {selectedConv.createdAt && (
                    <span className='ml-auto text-gray-400 text-xs'>
                      {t('conversations.createdAt', {
                        date: formatDateTimeShortI18n(
                          selectedConv.createdAt,
                          locale as SupportedLocale
                        ),
                      })}
                    </span>
                  )}
                </div>
              )}

              {/* Message list */}
              <ScrollArea
                className='flex-1'
                ref={(node) => {
                  ;(msgScrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node
                  // Cache Radix scroll viewport for restoring position after loading earlier messages
                  msgViewportRef.current =
                    node?.querySelector<HTMLDivElement>('[data-radix-scroll-area-viewport]') ?? null
                }}
              >
                <div className='mx-auto max-w-3xl space-y-3 px-4 py-4'>
                  {/* Load earlier messages */}
                  {hasMoreMessages && (
                    <div className='text-center'>
                      <Button
                        data-testid='chat:history:load-more-msgs'
                        variant='ghost'
                        size='sm'
                        className='h-7 text-gray-500 text-xs'
                        disabled={isLoadingMoreMsgs}
                        onClick={loadMoreMessages}
                      >
                        {isLoadingMoreMsgs ? (
                          <Loader2 className='mr-1.5 h-3 w-3 animate-spin' />
                        ) : (
                          <ChevronUp className='mr-1.5 h-3 w-3' />
                        )}
                        {isLoadingMoreMsgs ? t('common.loading') : t('conversations.loadEarlier')}
                      </Button>
                    </div>
                  )}

                  {visibleMessages.length === 0 && (
                    <p className='py-8 text-center text-gray-400 text-sm'>
                      {t('conversations.noMessages')}
                    </p>
                  )}
                  {visibleMessages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      id={msg.id}
                      role={msg.role}
                      content={msg.content}
                      createdAt={msg.createdAt}
                      files={msg.metadata?.files}
                    />
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

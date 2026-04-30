'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ConnectionConfig, HealthMessageI18n } from '@/lib/connectors/types'

export interface ChannelRecord {
  id: string
  name: string
  type: string
  description: string | null
  status: string
  statusIndicator: string
  boundEmployeeId: string | null
  webhookUrl: string | null
  lastHealthCheck: string | null
  lastHealthMessageI18n: HealthMessageI18n | null
  createdAt: string
  updatedAt: string
  config: Record<string, unknown>
}

interface Pagination {
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface UseChannelsOptions {
  type?: string
  status?: string
}

export function useChannels(options: UseChannelsOptions = {}) {
  const [channels, setChannels] = useState<ChannelRecord[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 1,
    pageSize: 12,
    totalPages: 0,
  })
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  const fetchChannels = useCallback(
    async (page = 1, searchQuery = search) => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: '12' })
        if (searchQuery) params.set('search', searchQuery)
        if (options.type && options.type !== 'all') params.set('type', options.type)
        if (options.status && options.status !== 'all') params.set('status', options.status)

        const res = await fetch(`/api/employee/channels?${params}`)
        const json = await res.json()

        if (json.success) {
          setChannels(json.data)
          setPagination({
            total: json.total,
            page: json.page,
            pageSize: json.pageSize,
            totalPages: json.totalPages,
          })
        }
      } finally {
        setIsLoading(false)
      }
    },
    [search, options.type, options.status]
  )

  useEffect(() => {
    fetchChannels(1, '')
  }, [fetchChannels])

  const handleSearch = useCallback(
    (value: string) => {
      setSearch(value)
      fetchChannels(1, value)
    },
    [fetchChannels]
  )

  const handlePageChange = useCallback(
    (page: number) => {
      fetchChannels(page)
    },
    [fetchChannels]
  )

  const create = useCallback(
    async (data: {
      name: string
      type: string
      description?: string
      config: ConnectionConfig
    }) => {
      const res = await fetch('/api/employee/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (json.success) {
        await fetchChannels(pagination.page)
      }
      return json
    },
    [fetchChannels, pagination.page]
  )

  const update = useCallback(
    async (
      id: string,
      data: {
        name?: string
        description?: string
        config?: Partial<ConnectionConfig>
      }
    ) => {
      const res = await fetch(`/api/employee/channels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (json.success) {
        await fetchChannels(pagination.page)
      }
      return json
    },
    [fetchChannels, pagination.page]
  )

  const remove = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/employee/channels/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.success) {
        await fetchChannels(pagination.page)
      }
      return json
    },
    [fetchChannels, pagination.page]
  )

  const test = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/employee/channels/${id}/test`, { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        await fetchChannels(pagination.page)
      }
      return json
    },
    [fetchChannels, pagination.page]
  )

  return {
    channels,
    pagination,
    search,
    isLoading,
    create,
    update,
    remove,
    test,
    handleSearch,
    handlePageChange,
    refresh: () => fetchChannels(pagination.page),
  }
}

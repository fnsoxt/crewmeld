'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ContactMethod } from '@crewmeld/db/schema'
import { useTranslation } from '@/hooks/use-translation'

interface HumanEmployee {
  id: string
  name: string
  title: string
  department: string | null
  contactMethods: ContactMethod[]
  createdAt: string
  updatedAt: string
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface CreatePayload {
  name: string
  title: string
  department?: string
  contactMethods?: ContactMethod[]
}

interface UpdatePayload {
  name?: string
  title?: string
  department?: string
  contactMethods?: ContactMethod[]
}

export function useHumanEmployees() {
  const { tMessage } = useTranslation()
  const [employees, setEmployees] = useState<HumanEmployee[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  })
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const fetchEmployees = useCallback(
    async (page = 1, searchQuery = search) => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: '20' })
        if (searchQuery) params.set('search', searchQuery)

        const res = await fetch(`/api/employee/human-employees?${params}`)
        const json = await res.json()
        if (json.success) {
          setEmployees(json.data)
          setPagination(json.pagination)
        }
      } finally {
        setIsLoading(false)
      }
    },
    [search]
  )

  const create = useCallback(
    async (data: CreatePayload) => {
      const res = await fetch('/api/employee/human-employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!json.success) throw new Error(tMessage(json))
      await fetchEmployees(pagination.page)
      return json.data as HumanEmployee
    },
    [fetchEmployees, pagination.page, tMessage]
  )

  const update = useCallback(
    async (id: string, data: UpdatePayload) => {
      const res = await fetch(`/api/employee/human-employees/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!json.success) throw new Error(tMessage(json))
      await fetchEmployees(pagination.page)
      return json.data as HumanEmployee
    },
    [fetchEmployees, pagination.page, tMessage]
  )

  const remove = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/employee/human-employees/${id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!json.success) throw new Error(tMessage(json))
      await fetchEmployees(pagination.page)
    },
    [fetchEmployees, pagination.page, tMessage]
  )

  const handleSearch = useCallback(
    (value: string) => {
      setSearch(value)
      void fetchEmployees(1, value)
    },
    [fetchEmployees]
  )

  const handlePageChange = useCallback(
    (page: number) => {
      void fetchEmployees(page)
    },
    [fetchEmployees]
  )

  useEffect(() => {
    void fetchEmployees(1)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    employees,
    pagination,
    search,
    isLoading,
    create,
    update,
    remove,
    handleSearch,
    handlePageChange,
    refresh: () => fetchEmployees(pagination.page),
  }
}

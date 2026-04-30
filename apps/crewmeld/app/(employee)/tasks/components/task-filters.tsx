'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/core/utils/cn'
import { useTranslation } from '@/hooks/use-translation'
import type { TaskFilterState } from '../types'

interface SopOption {
  id: string
  name: string
}

interface TaskFiltersProps {
  filters: TaskFilterState
  onChange: (filters: TaskFilterState) => void
}

function StatusMultiSelect({
  value,
  onChange,
  statusOptions,
  allStatusLabel,
}: {
  value: string[]
  onChange: (v: string[]) => void
  statusOptions: { value: string; label: string }[]
  allStatusLabel: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const toggle = (v: string) => {
    if (value.includes(v)) {
      onChange(value.filter((s) => s !== v))
    } else {
      onChange([...value, v])
    }
  }

  const label =
    value.length === 0
      ? allStatusLabel
      : value.length === statusOptions.length
        ? allStatusLabel
        : value.map((v) => statusOptions.find((o) => o.value === v)?.label ?? v).join(', ')

  return (
    <div ref={ref} className='relative'>
      <button
        type='button'
        onClick={() => setOpen((o) => !o)}
        className='flex h-9 w-44 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background hover:bg-accent focus:outline-none'
      >
        <span className='truncate text-left text-muted-foreground'>{label}</span>
        <ChevronDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
      </button>

      {open && (
        <div className='absolute top-full left-0 z-50 mt-1 w-44 rounded-md border border-input bg-popover shadow-md'>
          {statusOptions.map((opt) => {
            const checked = value.includes(opt.value)
            return (
              <button
                key={opt.value}
                type='button'
                onClick={() => toggle(opt.value)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent',
                  checked && 'font-medium'
                )}
              >
                <div
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-primary',
                    checked ? 'bg-primary text-primary-foreground' : 'bg-background'
                  )}
                >
                  {checked && <Check className='h-3 w-3' />}
                </div>
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Custom date input component: fixes native <input type="date"> on Chinese Windows
 * showing mixed CJK/Latin placeholder "yyyy/mm/dd" when empty.
 * Shows plain text placeholder when empty, opens native date picker on click.
 */
/* Hide native date input placeholder when empty (e.g. yyyy/mm/dd) */
const DATE_INPUT_HIDE_PLACEHOLDER_STYLE = `
.date-input-empty::-webkit-datetime-edit,
.date-input-empty::-webkit-datetime-edit-fields-wrapper,
.date-input-empty::-webkit-datetime-edit-text,
.date-input-empty::-webkit-datetime-edit-month-field,
.date-input-empty::-webkit-datetime-edit-day-field,
.date-input-empty::-webkit-datetime-edit-year-field {
  opacity: 0;
}
`

let dateStyleInjected = false

function DateInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!dateStyleInjected && typeof document !== 'undefined') {
      const style = document.createElement('style')
      style.textContent = DATE_INPUT_HIDE_PLACEHOLDER_STYLE
      document.head.appendChild(style)
      dateStyleInjected = true
    }
  }, [])

  const handleContainerClick = () => {
    // Clicking anywhere in the area opens the date picker
    try {
      inputRef.current?.showPicker()
    } catch {
      // Fallback to focus for browsers like Firefox that do not support showPicker
      inputRef.current?.focus()
    }
  }

  return (
    <div
      className='relative flex h-9 w-44 cursor-pointer items-center'
      onClick={handleContainerClick}
    >
      <input
        ref={inputRef}
        type='date'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'absolute inset-0 h-full w-full cursor-pointer rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring',
          !value && 'date-input-empty'
        )}
        data-testid='task-filters:input:date'
      />
      {/* Show placeholder text when empty, click passes through to container */}
      {!value && (
        <span className='pointer-events-none absolute left-3 text-muted-foreground text-sm'>
          {placeholder}
        </span>
      )}
      {/* Clear button */}
      {value && (
        <button
          type='button'
          onClick={(e) => {
            e.stopPropagation()
            onChange('')
          }}
          className='absolute right-2 z-10 rounded p-0.5 text-muted-foreground hover:text-foreground'
        >
          <X className='h-3.5 w-3.5' />
        </button>
      )}
    </div>
  )
}

export function TaskFilters({ filters, onChange }: TaskFiltersProps) {
  const { t } = useTranslation()
  const [sops, setSops] = useState<SopOption[]>([])
  const [sopLoadError, setSopLoadError] = useState(false)

  const STATUS_OPTIONS = useMemo(
    () => [
      { value: 'completed', label: t('tasks.filterStatusCompleted') },
      { value: 'failed', label: t('tasks.filterStatusFailed') },
      { value: 'error', label: t('tasks.filterStatusError') },
      { value: 'timed_out', label: t('tasks.filterStatusTimeout') },
      { value: 'cancelled', label: t('tasks.filterStatusCancelled') },
    ],
    [t]
  )

  useEffect(() => {
    fetch('/api/employee/sops')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setSops(json.data.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })))
          setSopLoadError(false)
        }
      })
      .catch(() => {
        setSopLoadError(true)
      })
  }, [])

  const handleChange = useCallback(
    (key: keyof TaskFilterState, value: string) => {
      onChange({ ...filters, [key]: value })
    },
    [filters, onChange]
  )

  return (
    <div className='mb-4 flex flex-wrap gap-3'>
      <StatusMultiSelect
        value={filters.status}
        onChange={(v) => onChange({ ...filters, status: v })}
        statusOptions={STATUS_OPTIONS}
        allStatusLabel={t('tasks.filterAllStatus')}
      />

      <select
        value={filters.sopId || 'all'}
        onChange={(e) => handleChange('sopId', e.target.value === 'all' ? '' : e.target.value)}
        className='h-9 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none'
      >
        <option value='all'>{t('tasks.filterAllSop')}</option>
        {sopLoadError && (
          <option value='_error' disabled>
            {t('tasks.filterLoadFailed')}
          </option>
        )}
        {sops.map((sop) => (
          <option key={sop.id} value={sop.id}>
            {sop.name}
          </option>
        ))}
      </select>

      <DateInput
        value={filters.dateFrom}
        onChange={(v) => handleChange('dateFrom', v)}
        placeholder={t('tasks.filterStartDate')}
      />

      <DateInput
        value={filters.dateTo}
        onChange={(v) => handleChange('dateTo', v)}
        placeholder={t('tasks.filterEndDate')}
      />
    </div>
  )
}

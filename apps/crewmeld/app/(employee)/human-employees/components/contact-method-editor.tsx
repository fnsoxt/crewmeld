'use client'

import { useEffect, useState } from 'react'
import type { ContactMethod, ContactMethodType } from '@crewmeld/db/schema'
import { CONTACT_METHOD_TYPES } from '@crewmeld/db/schema'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslation } from '@/hooks/use-translation'

// CONTACT_TYPE_LABELS resolved dynamically via t() in component

interface ChannelAvailability {
  contactType: ContactMethodType
  available: boolean
}

interface ContactMethodEditorProps {
  value: ContactMethod[]
  onChange: (methods: ContactMethod[]) => void
}

export function ContactMethodEditor({ value, onChange }: ContactMethodEditorProps) {
  const { t } = useTranslation()
  const CONTACT_TYPE_LABELS: Record<ContactMethodType, string> = {
    email: t('humanEmployees.contactEmail'),
    wecom: t('humanEmployees.contactWecom'),
    dingtalk: t('humanEmployees.contactDingtalk'),
    feishu: t('humanEmployees.contactFeishu'),
    discord: 'Discord',
    telegram: 'Telegram',
  }
  const [availability, setAvailability] = useState<ChannelAvailability[]>([])

  useEffect(() => {
    fetch('/api/employee/human-employees/contact-availability')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setAvailability(json.data)
      })
      .catch(() => {})
  }, [])

  const availabilityMap = new Map(availability.map((a) => [a.contactType, a.available]))

  const handleAdd = () => {
    onChange([...value, { type: 'email', value: '' }])
  }

  const handleRemove = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  const handleTypeChange = (index: number, type: ContactMethodType) => {
    const updated = [...value]
    updated[index] = { ...updated[index], type }
    onChange(updated)
  }

  const handleValueChange = (index: number, val: string) => {
    const updated = [...value]
    updated[index] = { ...updated[index], value: val }
    onChange(updated)
  }

  return (
    <div className='space-y-2'>
      {value.map((method, index) => (
        <div key={index} className='flex items-center gap-2'>
          <div className='relative'>
            <Select
              value={method.type}
              onValueChange={(v) => handleTypeChange(index, v as ContactMethodType)}
            >
              <SelectTrigger className='w-32' data-testid={`human-emp-form:contact:type:${index}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_METHOD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    <span className='flex items-center gap-1.5'>
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          availabilityMap.get(t) ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      />
                      {CONTACT_TYPE_LABELS[t]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            className='flex-1'
            placeholder={t('humanEmployees.contactPlaceholder')}
            value={method.value}
            onChange={(e) => handleValueChange(index, e.target.value)}
            data-testid={`human-emp-form:contact:value:${index}`}
          />
          <Button
            type='button'
            variant='ghost'
            size='icon'
            onClick={() => handleRemove(index)}
            data-testid={`human-emp-form:contact:remove:${index}`}
          >
            <Trash2 className='h-4 w-4 text-gray-400' />
          </Button>
        </div>
      ))}
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={handleAdd}
        data-testid='human-emp-form:contact:add'
      >
        <Plus className='mr-1 h-3 w-3' />
        {t('humanEmployees.addContact')}
      </Button>
    </div>
  )
}

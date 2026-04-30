'use client'

import type { LucideIcon } from 'lucide-react'
import { BookOpen, Link2, Wrench } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useTranslation } from '@/hooks/use-translation'

interface AssetOverviewData {
  tools: {
    total: number
    deployed: number
    boundCount: number
  }
  knowledgeBases: {
    total: number
    boundCount: number
  }
  connections: {
    total: number
    connectedCount: number
  }
}

interface AssetOverviewProps {
  data: AssetOverviewData
}

interface AssetCardConfig {
  key: string
  icon: LucideIcon
  iconColor: string
  bgColor: string
  label: string
  total: number
  detail: string
}

export function AssetOverview({ data }: AssetOverviewProps) {
  const { t } = useTranslation()
  const cards: AssetCardConfig[] = [
    {
      key: 'tools',
      icon: Wrench,
      iconColor: 'text-blue-600',
      bgColor: 'bg-blue-50',
      label: t('dashboard.tools'),
      total: data.tools.total,
      detail: `${data.tools.deployed} ${t('dashboard.deployed')} · ${data.tools.boundCount} ${t('dashboard.bound')}`,
    },
    {
      key: 'knowledge',
      icon: BookOpen,
      iconColor: 'text-amber-600',
      bgColor: 'bg-amber-50',
      label: t('dashboard.knowledgeBases'),
      total: data.knowledgeBases.total,
      detail: `${data.knowledgeBases.boundCount} ${t('dashboard.bound')}`,
    },
    {
      key: 'connections',
      icon: Link2,
      iconColor: 'text-teal-600',
      bgColor: 'bg-teal-50',
      label: t('dashboard.connections'),
      total: data.connections.total,
      detail: `${data.connections.connectedCount} ${t('dashboard.connected')}`,
    },
  ]

  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-3' data-testid='dashboard:asset-overview'>
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <Card key={card.key}>
            <CardContent className='flex items-center gap-3 p-4'>
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.bgColor}`}
              >
                <Icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
              <div>
                <p className='text-gray-500 text-sm'>{card.label}</p>
                <p className='font-semibold text-gray-900 text-xl'>{card.total}</p>
                <p className='text-gray-400 text-xs'>{card.detail}</p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

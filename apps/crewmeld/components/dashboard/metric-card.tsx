import { ArrowDown, ArrowUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/core/utils/cn'

interface MetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: {
    value: number
    isPositive: boolean
  }
  alert?: boolean
  onClick?: () => void
}

export function MetricCard({ title, value, subtitle, trend, alert, onClick }: MetricCardProps) {
  return (
    <Card
      className={cn(
        'transition-shadow hover:shadow-md',
        alert && 'border-red-200',
        onClick && 'cursor-pointer'
      )}
      onClick={onClick}
    >
      <CardContent className='p-5'>
        <div className='font-medium text-muted-foreground text-sm'>{title}</div>
        <div className='mt-2 flex items-baseline gap-2'>
          <div className={cn('font-bold text-3xl text-gray-900', alert && 'text-red-600')}>
            {value}
          </div>
          {trend && trend.value !== 0 && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-medium text-xs',
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              )}
            >
              {trend.isPositive ? (
                <ArrowUp className='h-3 w-3' />
              ) : (
                <ArrowDown className='h-3 w-3' />
              )}
              {Math.abs(trend.value)}%
            </span>
          )}
        </div>
        {subtitle && <div className='mt-1 text-muted-foreground text-xs'>{subtitle}</div>}
      </CardContent>
    </Card>
  )
}

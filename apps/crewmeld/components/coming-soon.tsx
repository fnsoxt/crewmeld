import { Card } from '@/components/ui/card'

/**
 * Placeholder component for P1-deferred features.
 *
 * Shown on menus that route to feature pages not yet implemented in P0.
 */
export function ComingSoon({ feature }: { feature: string }) {
  return (
    <div className='flex min-h-[60vh] items-center justify-center'>
      <Card className='p-8 text-center'>
        <h2 className='mb-2 font-semibold text-xl'>{feature}</h2>
        <p className='text-muted-foreground'>此功能将于 P1 阶段启用</p>
      </Card>
    </div>
  )
}

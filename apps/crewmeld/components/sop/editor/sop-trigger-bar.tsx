'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/hooks/use-translation'
import { useSopEditorStore } from '@/stores/sop/editor-store'

export function SopTriggerBar() {
  const { t } = useTranslation()
  const sopTimeoutMinutes = useSopEditorStore((s) => s.sopTimeoutMinutes)
  const maxRejectionCycles = useSopEditorStore((s) => s.maxRejectionCycles)
  const setSopTimeoutMinutes = useSopEditorStore((s) => s.setSopTimeoutMinutes)
  const setMaxRejectionCycles = useSopEditorStore((s) => s.setMaxRejectionCycles)

  return (
    <div
      className='flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-white p-4'
      data-testid='sop-editor:trigger-bar'
    >
      <div className='w-32'>
        <Label className='mb-1.5 text-gray-500 text-xs'>{t('sops.triggerTimeout')}</Label>
        <Input
          type='number'
          min={1}
          value={sopTimeoutMinutes}
          onChange={(e) => setSopTimeoutMinutes(Math.max(1, Number(e.target.value) || 1440))}
          data-testid='sop-editor:trigger-bar:timeout'
        />
      </div>

      <div className='w-32'>
        <Label className='mb-1.5 text-gray-500 text-xs'>{t('sops.triggerMaxRejections')}</Label>
        <Input
          type='number'
          min={1}
          max={10}
          value={maxRejectionCycles}
          onChange={(e) =>
            setMaxRejectionCycles(Math.min(10, Math.max(1, Number(e.target.value) || 3)))
          }
          data-testid='sop-editor:trigger-bar:max-rejections'
        />
      </div>
    </div>
  )
}

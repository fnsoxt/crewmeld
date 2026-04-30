'use client'

import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/core/utils/cn'
import { useTranslation } from '@/hooks/use-translation'
import { STEP_LABEL_KEYS } from '../types'

interface WizardLayoutProps {
  currentStep: number
  canGoNext: boolean
  canGoPrevious: boolean
  isSubmitting: boolean
  onPrevious: () => void
  onNext: () => void
  onFinish: () => void
  children: ReactNode
}

export function WizardLayout({
  currentStep,
  canGoNext,
  canGoPrevious,
  isSubmitting,
  onPrevious,
  onNext,
  onFinish,
  children,
}: WizardLayoutProps) {
  const { t } = useTranslation()
  const stepLabels = STEP_LABEL_KEYS.map((key) => t(key))
  const isLastStep = currentStep === stepLabels.length

  return (
    <div>
      <div className='mb-8 flex items-center justify-center'>
        {stepLabels.map((label, i) => {
          const step = i + 1
          const isActive = step === currentStep
          const isCompleted = step < currentStep
          return (
            <div key={step} className='flex items-center'>
              <div className='flex flex-col items-center'>
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full font-medium text-sm transition-colors',
                    isActive && 'bg-blue-600 text-white',
                    isCompleted && 'bg-green-600 text-white',
                    !isActive && !isCompleted && 'bg-gray-200 text-gray-400'
                  )}
                >
                  {isCompleted ? <Check className='h-5 w-5' /> : step}
                </div>
                <span
                  className={cn(
                    'mt-2 text-xs',
                    isActive && 'font-medium text-blue-600',
                    isCompleted && 'text-green-600',
                    !isActive && !isCompleted && 'text-gray-400'
                  )}
                >
                  {label}
                </span>
              </div>
              {step < stepLabels.length && (
                <div
                  className={cn(
                    'mx-3 mt-[-1.25rem] h-0.5 w-12',
                    step < currentStep ? 'bg-green-600' : 'bg-gray-200'
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      <div className='min-h-[400px]'>{children}</div>

      <div className='mt-8 flex items-center justify-between border-gray-200 border-t pt-6'>
        <Button variant='outline' onClick={onPrevious} disabled={!canGoPrevious || isSubmitting}>
          {t('employees.wizardPrevious')}
        </Button>
        {isLastStep ? (
          <Button onClick={onFinish} disabled={!canGoNext || isSubmitting}>
            {isSubmitting ? t('employees.wizardCreating') : t('employees.wizardOnboard')}
          </Button>
        ) : (
          <Button onClick={onNext} disabled={!canGoNext}>
            {t('employees.wizardNext')}
          </Button>
        )}
      </div>
    </div>
  )
}

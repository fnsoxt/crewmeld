'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, Play, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/hooks/use-translation'
import type { CreatedEmployee, TestRunResult, WizardMode } from '../types'

interface Step5TestRunProps {
  mode: WizardMode
  employeeId: string | null
  createdEmployees: CreatedEmployee[]
  employeeName: string
  testResult: TestRunResult | null
  onRunTest: (employeeId: string, input: Record<string, unknown>) => Promise<void>
}

export function Step5TestRun({
  mode,
  employeeId,
  createdEmployees,
  employeeName,
  testResult,
  onRunTest,
}: Step5TestRunProps) {
  const { t } = useTranslation()
  const [testInput, setTestInput] = useState('{\n  "query": "test input"\n}')
  const [isRunning, setIsRunning] = useState(false)

  const activeEmployeeId = mode === 'single' ? employeeId : (createdEmployees[0]?.id ?? null)
  const hasEmployee = mode === 'single' ? !!employeeId : createdEmployees.length > 0

  const handleRun = async () => {
    if (!activeEmployeeId) return
    setIsRunning(true)
    try {
      await onRunTest(activeEmployeeId, {})
    } finally {
      setIsRunning(false)
    }
  }

  if (!hasEmployee) {
    return (
      <div>
        <h2 className='mb-2 font-semibold text-gray-900 text-lg'>{t('employees.testRunTitle')}</h2>
        <div className='flex h-48 flex-col items-center justify-center rounded-xl border border-gray-300 border-dashed'>
          <p className='text-gray-500 text-sm'>{t('employees.testRunNotReady')}</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className='mb-2 font-semibold text-gray-900 text-lg'>{t('employees.testRunTitle')}</h2>
      <p className='mb-8 text-gray-500 text-sm'>
        {t('employees.testRunDesc', { name: employeeName })}
      </p>

      <div className='mx-auto max-w-md space-y-6'>
        {!testResult ? (
          <div className='flex flex-col items-center gap-4 py-8'>
            <Button size='lg' onClick={handleRun} disabled={isRunning} className='px-8'>
              {isRunning ? (
                <>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  {t('employees.testRunExecuting')}
                </>
              ) : (
                <>
                  <Play className='h-4 w-4' />
                  {t('employees.testRunStart')}
                </>
              )}
            </Button>
            {isRunning && <p className='text-gray-400 text-sm'>{t('employees.testRunRunning')}</p>}
          </div>
        ) : testResult.status === 'success' ? (
          <div className='flex flex-col items-center gap-4 rounded-2xl border border-green-200 bg-green-50 px-8 py-10 text-center'>
            <CheckCircle2 className='h-14 w-14 text-green-500' />
            <div>
              <p className='font-semibold text-gray-900 text-lg'>
                {t('employees.testRunSuccessTitle')}
              </p>
              <p className='mt-1 text-gray-500 text-sm'>
                {t('employees.testRunSuccessDesc', { name: employeeName })}
              </p>
            </div>
            <button
              type='button'
              onClick={handleRun}
              disabled={isRunning}
              className='mt-2 text-gray-400 text-xs underline-offset-2 hover:text-gray-600 hover:underline'
            >
              {t('employees.testRunRerun')}
            </button>
          </div>
        ) : (
          <div className='flex flex-col items-center gap-4 rounded-2xl border border-red-200 bg-red-50 px-8 py-10 text-center'>
            <XCircle className='h-14 w-14 text-red-400' />
            <div>
              <p className='font-semibold text-gray-900 text-lg'>
                {t('employees.testRunFailedTitle')}
              </p>
              <p className='mt-1 text-gray-500 text-sm'>{t('employees.testRunFailedDesc')}</p>
            </div>
            <Button variant='outline' onClick={handleRun} disabled={isRunning} className='mt-2'>
              {isRunning ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <Play className='h-4 w-4' />
              )}
              {t('employees.testRunRerun')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SetupWizard } from './components/setup-wizard'

type PageState = 'loading' | 'setup' | 'redirect'

export default function SetupPage() {
  const router = useRouter()
  const [pageState, setPageState] = useState<PageState>('loading')

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch('/api/system/setup/status')
        if (!res.ok) {
          setPageState('setup')
          return
        }
        const body = await res.json()
        // Support both `{ initialized }` and the wrapped `{ success, data: { initialized } }`.
        const initialized =
          body && typeof body === 'object' && 'data' in body && body.data
            ? (body.data as { initialized?: boolean }).initialized
            : (body as { initialized?: boolean }).initialized
        if (initialized) {
          setPageState('redirect')
          router.replace('/dashboard')
        } else {
          setPageState('setup')
        }
      } catch {
        setPageState('setup')
      }
    }
    checkStatus()
  }, [router])

  if (pageState === 'loading' || pageState === 'redirect') {
    return (
      <div className='flex items-center justify-center py-20'>
        <div className='h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600' />
      </div>
    )
  }

  return <SetupWizard />
}

'use client'

import { AuthBrandPanel } from '@/app/(auth)/components/auth-brand-panel'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex min-h-screen flex-col bg-white lg:flex-row'>
      <AuthBrandPanel />
      <main className='relative flex flex-1 flex-col items-center justify-center px-4 py-12 lg:w-[60%]'>
        <div className='w-full max-w-lg px-4'>{children}</div>
      </main>
    </div>
  )
}

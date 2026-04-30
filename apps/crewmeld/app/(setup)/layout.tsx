import type { ReactNode } from 'react'

interface SetupLayoutProps {
  children: ReactNode
}

export default function SetupLayout({ children }: SetupLayoutProps) {
  return (
    <div className='flex min-h-screen items-center justify-center bg-gray-50 p-4'>
      <div className='w-full max-w-lg'>{children}</div>
    </div>
  )
}

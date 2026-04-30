import type { ReactNode } from 'react'

interface ApprovalLayoutProps {
  children: ReactNode
}

/**
 * Standalone approval page route group - no sidebar, no session required
 */
export default function ApprovalLayout({ children }: ApprovalLayoutProps) {
  return (
    <div className='flex min-h-screen items-center justify-center bg-gray-50 p-4'>
      <div className='w-full max-w-lg'>{children}</div>
    </div>
  )
}

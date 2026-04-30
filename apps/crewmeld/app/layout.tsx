import type { Metadata, Viewport } from 'next'
import { QueryProvider } from '@/app/_shell/providers/query-provider'
import { SessionProvider } from '@/app/_shell/providers/session-provider'
import { inter } from '@/app/_styles/fonts/inter/inter'
import '@/app/_styles/globals.css'

/**
 * Root layout for P0. Ports the minimum shell required to mount the session +
 * query providers; the full upstream layout adds PostHog, theme toggles,
 * whitelabel branding, etc. — those land in P1.
 */

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0c0c' },
  ],
}

export const metadata: Metadata = {
  title: 'CrewMeld',
  description: 'Enterprise AI digital employee platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='zh-CN' className={inter.variable} suppressHydrationWarning>
      <body
        className='min-h-screen bg-background text-foreground antialiased'
        suppressHydrationWarning
      >
        <QueryProvider>
          <SessionProvider>{children}</SessionProvider>
        </QueryProvider>
      </body>
    </html>
  )
}

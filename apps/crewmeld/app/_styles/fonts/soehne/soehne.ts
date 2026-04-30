/**
 * Söhne font stub — P0 ships without the proprietary Söhne woff2 files.
 * Falls back to Inter (variable) so `className` / `variable` still resolve.
 * TODO: P1 — replace with next/font/local Söhne definition when licensed
 * font files are available on the build host.
 */
import { Inter } from 'next/font/google'

export const soehne = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-soehne',
  weight: 'variable',
  fallback: ['system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'Noto Sans'],
})

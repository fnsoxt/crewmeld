import { toNextJsHandler } from 'better-auth/next-js'
import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createAnonymousSession, ensureAnonymousUserExists } from '@/lib/auth/anonymous'
import { isAuthDisabled } from '@/lib/core/config/feature-flags'

export const dynamic = 'force-dynamic'

/** Delegate all better-auth HTTP traffic through its Next.js adapter. */
const { GET: baGet, POST: baPost } = toNextJsHandler(auth.handler)

/** Override get-session to return an anonymous session when auth is disabled. */
export async function GET(request: NextRequest) {
  const { pathname } = new URL(request.url)
  const authPath = pathname.replace('/api/auth/', '')

  if (authPath === 'get-session' && isAuthDisabled) {
    await ensureAnonymousUserExists()
    return NextResponse.json(createAnonymousSession())
  }

  return baGet(request)
}

export const POST = baPost

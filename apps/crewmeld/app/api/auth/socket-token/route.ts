import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isAuthDisabled } from '@/lib/core/config/feature-flags'

/** Issue a one-time WebSocket auth token for the current session, or a stub in auth-disabled mode. */
export async function POST() {
  if (isAuthDisabled) {
    return NextResponse.json({ token: 'anonymous-socket-token' })
  }

  const hdrs = await headers()

  let result: { token?: string } | null = null
  try {
    result = await auth.api.generateOneTimeToken({ headers: hdrs })
  } catch {
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 })
  }

  if (!result?.token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  return NextResponse.json({ token: result.token })
}

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: process.env.VERSION || 'dev',
    timestamp: new Date().toISOString(),
  })
}

import { createLogger } from '@crewmeld/logger'
import type { NextRequest } from 'next/server'
import { apiAuthErr } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { encodeSSE, SSE_HEADERS } from '@/lib/core/utils/sse'
import { getExecutionMeta } from '@/lib/execution/event-buffer'

const _logger = createLogger('API:Sops:Stream')

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; execId: string }> }
) {
  const auth = await requirePermission('sop:list')
  if (!auth.authenticated || auth.error) {
    return apiAuthErr(auth)
  }

  const { execId } = await params

  const stream = new ReadableStream({
    async start(controller) {
      const pollInterval = setInterval(async () => {
        try {
          const meta = await getExecutionMeta(execId)
          if (
            meta?.status === 'complete' ||
            meta?.status === 'error' ||
            meta?.status === 'cancelled' ||
            meta?.status === 'timed_out'
          ) {
            controller.enqueue(encodeSSE({ type: 'done' }))
            clearInterval(pollInterval)
            controller.close()
          }
        } catch {
          clearInterval(pollInterval)
          controller.close()
        }
      }, 1000)

      request.signal.addEventListener('abort', () => {
        clearInterval(pollInterval)
        try {
          controller.close()
        } catch {
          // Already closed
        }
      })
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}

import { createLogger } from '@crewmeld/logger'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import {
  loadRagflowConfig,
  parseDocuments,
  RagflowClientError,
  stopDocumentsParsing,
} from '@/lib/ragflow'

const logger = createLogger('RagflowParseAPI')

/**
 * POST /api/employee/ragflow/datasets/[id]/documents/parse — Trigger document parsing
 * Body: { documentIds: string[] }
 */
async function _POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('knowledge:edit')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params
    const body = (await request.json()) as { documentIds?: string[] }
    const documentIds = body.documentIds

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return apiErr('api.ragflow.parseDocumentIdsRequired', { status: 400 })
    }

    const config = await loadRagflowConfig()
    // Stop current parsing first (ignore failures; may not be parsing)
    try {
      await stopDocumentsParsing(config, id, documentIds)
    } catch {
      // ignore
    }
    await parseDocuments(config, id, documentIds)

    logger.info(`Manually triggered document parsing: dataset=${id}, docs=${documentIds.join(',')}`)

    return apiOk(null)
  } catch (error) {
    if (error instanceof RagflowClientError) {
      return apiErr('api.ragflow.upstreamError', { status: 502, extra: { detail: error.message } })
    }
    logger.error('Failed to trigger document parsing', error)
    return apiErr('api.ragflow.parseFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)

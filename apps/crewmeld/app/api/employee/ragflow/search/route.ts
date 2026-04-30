import { createLogger } from '@crewmeld/logger'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { loadRagflowConfig, RagflowClientError, retrieval } from '@/lib/ragflow'

const logger = createLogger('RagflowSearchAPI')

/**
 * POST /api/employee/ragflow/search — Knowledge base retrieval
 */
async function _POST(request: NextRequest) {
  try {
    const auth = await requirePermission('knowledge:list')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const body = (await request.json()) as {
      datasetIds?: string[]
      query?: string
      topK?: number
      similarityThreshold?: number
    }

    if (!body.query || !body.datasetIds?.length) {
      return apiErr('api.ragflow.searchMissingFields', { status: 400 })
    }

    const config = await loadRagflowConfig()
    const data = await retrieval(config, {
      datasetIds: body.datasetIds,
      query: body.query,
      topK: body.topK,
      similarityThreshold: body.similarityThreshold,
    })

    const results = (data.chunks ?? []).map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      documentId: chunk.document_id,
      documentName: chunk.document_name,
      datasetId: chunk.dataset_id,
      similarity: chunk.similarity,
    }))

    return apiOk({
      results,
      totalResults: results.length,
      docAggs: data.doc_aggs ?? [],
    })
  } catch (error) {
    if (error instanceof RagflowClientError) {
      return apiErr('api.ragflow.upstreamError', { status: 502, extra: { detail: error.message } })
    }
    logger.error('Knowledge search failed', error)
    return apiErr('api.ragflow.searchFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)

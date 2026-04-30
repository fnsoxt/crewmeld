import { createLogger } from '@crewmeld/logger'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { getDataset, loadRagflowConfig, RagflowClientError } from '@/lib/ragflow'

const logger = createLogger('RagflowDatasetDetailAPI')

/**
 * GET /api/employee/ragflow/datasets/[id] — Knowledge base detail
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('knowledge:list')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params
    const config = await loadRagflowConfig()
    const dataset = await getDataset(config, id)

    return apiOk(dataset)
  } catch (error) {
    if (error instanceof RagflowClientError) {
      const status = error.type === 'NOT_FOUND' ? 404 : 502
      return apiErr('api.ragflow.upstreamError', { status, extra: { detail: error.message } })
    }
    logger.error('Failed to fetch knowledge base detail', error)
    return apiErr('api.ragflow.datasetDetailFailed', { status: 500 })
  }
}

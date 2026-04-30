import { createLogger } from '@crewmeld/logger'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import {
  createTestDeployment,
  deleteTestDeployment,
  isK8sConfigured,
} from '@/lib/k8s/test-deployment'

const logger = createLogger('TestPodAPI')

/**
 * POST /api/employee/tools/test-pod
 *
 * Create a test-only Deployment.
 * Returns { podName, endpoint } or { podName: null } indicating fallback to local execution.
 */
async function _POST(_request: NextRequest) {
  try {
    const auth = await requirePermission('skill:deploy')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    if (!isK8sConfigured()) {
      logger.info('K8S not configured, falling back to local execution')
      return apiOk(null, { extra: { podName: null, endpoint: null } })
    }

    // Generate unique sessionId from userId + timestamp (lowercase, K8S RFC 1123 compliant)
    const sessionId = `${auth.userId!.slice(0, 8)}-${Date.now().toString(36)}`.toLowerCase()
    const result = await createTestDeployment(sessionId)

    logger.info('Test Deployment created', {
      deploymentName: result.deploymentName,
      endpoint: result.endpoint,
      userId: auth.userId,
    })

    return apiOk(null, {
      extra: {
        podName: result.deploymentName, // Frontend uses podName field, actually deployment name
        endpoint: result.endpoint,
      },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error('Failed to create test Deployment', { error: msg })
    // Fall back to local execution on K8S failure, don't block user, but return error info for debugging
    return apiOk(null, { extra: { podName: null, endpoint: null, k8sError: msg } })
  }
}

/**
 * DELETE /api/employee/tools/test-pod
 *
 * Destroy test Deployment.
 * Body: { podName: string } (podName is actually deploymentName, format: test-{sessionId})
 */
async function _DELETE(request: NextRequest) {
  try {
    const auth = await requirePermission('skill:deploy')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const body = await request.json()
    const { podName } = body as { podName: string }

    if (!podName || typeof podName !== 'string') {
      return apiErr('api.tool.podNameRequired', { status: 400 })
    }

    // podName format: test-{sessionId}, extract sessionId
    const sessionId = podName.replace(/^test-/, '')
    await deleteTestDeployment(sessionId)
    logger.info('Test Deployment deleted', { podName, userId: auth.userId })

    return apiOk(null)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error('Failed to delete test Deployment', { error: msg })
    // Deletion failure should not block frontend
    return apiOk(null)
  }
}

export const POST = withAudit(_POST)
export const DELETE = withAudit(_DELETE)

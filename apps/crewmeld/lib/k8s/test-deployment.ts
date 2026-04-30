/**
 * Test Deployment management
 *
 * Create independent Deployment + Service for each "add tool" session,
 * lifecycle bound to modal: create on first test, destroy on close/cancel/adopt.
 *
 * Differences from warm pool approach:
 * - Create brand new Deployment each time, no Pod reuse (avoid residual state)
 * - Mount universal Server code via ConfigMap (shared with warm pool)
 * - Independent Service + unique selector, no cross-Pod routing issues
 */

import http from 'http'
import https from 'https'
import { createLogger } from '@crewmeld/logger'

const logger = createLogger('K8sTestDeployment')

const K8S_API_SERVER = process.env.K8S_API_SERVER ?? ''
const K8S_API_TOKEN = process.env.K8S_API_TOKEN ?? ''
const K8S_NAMESPACE = process.env.K8S_DEPLOY_NAMESPACE ?? 'crewmeld-skills'
const K8S_NODE_IP = process.env.K8S_NODE_IP ?? ''
const K8S_SKIP_TLS = process.env.K8S_SKIP_TLS_VERIFY === 'true'
// Pinned tag — see deploy-skill.ts IMAGE_MAP for rationale.
const POOL_IMAGE =
  process.env.K8S_WARM_POOL_IMAGE ??
  process.env.K8S_IMAGE_NODE ??
  'docker.io/library/node:22-bookworm'

// ---------------------------------------------------------------------------
// K8S API requests
// ---------------------------------------------------------------------------

interface K8sResponse {
  ok: boolean
  status: number
  json: () => Promise<Record<string, unknown>>
  text: () => Promise<string>
}

function k8sApi(path: string, opts: { method: string; body?: unknown }): Promise<K8sResponse> {
  const url = new URL(path, K8S_API_SERVER)
  const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined
  const isHttps = url.protocol === 'https:'
  const transport = isHttps ? https : http

  return new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: opts.method,
        headers: {
          Authorization: `Bearer ${K8S_API_TOKEN}`,
          'Content-Type': 'application/json',
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr).toString() } : {}),
        },
        ...(K8S_SKIP_TLS && isHttps ? { rejectUnauthorized: false } : {}),
      } as https.RequestOptions,
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8')
          const status = res.statusCode ?? 500
          resolve({
            ok: status >= 200 && status < 300,
            status,
            json: () => Promise.resolve(JSON.parse(raw)),
            text: () => Promise.resolve(raw),
          })
        })
      }
    )
    req.on('error', reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

// ---------------------------------------------------------------------------
// Check if K8S is configured
// ---------------------------------------------------------------------------

export function isK8sConfigured(): boolean {
  return Boolean(K8S_API_SERVER && K8S_API_TOKEN)
}

// ---------------------------------------------------------------------------
// Create test Deployment
// ---------------------------------------------------------------------------

export async function createTestDeployment(sessionId: string): Promise<{
  deploymentName: string
  endpoint: string
}> {
  const name = `test-${sessionId}`

  logger.info(`Creating test deployment: ${name}`)

  // 0. Clean up old test Deployments for this user (prevent leaks from page refresh)
  await cleanupOldTestDeployments(sessionId)

  // 1. Ensure ConfigMap exists (initWarmPool already created, defensive check here)
  await ensureServerConfigMap()

  // 2. Create Deployment
  const deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name,
      namespace: K8S_NAMESPACE,
      labels: { app: 'crewmeld-test', 'test-session': sessionId },
    },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'crewmeld-test', 'test-session': sessionId } },
      template: {
        metadata: { labels: { app: 'crewmeld-test', 'test-session': sessionId } },
        spec: {
          containers: [
            {
              name: 'tool',
              image: POOL_IMAGE,
              imagePullPolicy: 'IfNotPresent',
              command: ['node', '--experimental-fetch', '/app/server.mjs'],
              ports: [{ containerPort: 3000 }],
              env: [
                { name: 'MINIO_ENDPOINT', value: process.env.MINIO_ENDPOINT ?? '' },
                { name: 'MINIO_ACCESS_KEY', value: process.env.MINIO_ACCESS_KEY ?? '' },
                { name: 'MINIO_SECRET_KEY', value: process.env.MINIO_SECRET_KEY ?? '' },
                { name: 'MINIO_BUCKET', value: process.env.MINIO_BUCKET ?? 'tool-files' },
                { name: 'MINIO_PUBLIC_URL', value: process.env.MINIO_PUBLIC_URL ?? '' },
              ],
              volumeMounts: [
                { name: 'server', mountPath: '/app/server.mjs', subPath: 'server.mjs' },
                { name: 'deps-cache', mountPath: '/cache' },
                // playwright browser binary cache, shared with Python Deployment via same PVC subPath
                {
                  name: 'deps-cache',
                  mountPath: '/root/.cache/ms-playwright',
                  subPath: 'playwright-browsers',
                },
              ],
              resources: {
                limits: { cpu: '500m', memory: '512Mi' },
                requests: { cpu: '100m', memory: '128Mi' },
              },
              readinessProbe: {
                httpGet: { path: '/health', port: 3000 },
                initialDelaySeconds: 2,
                periodSeconds: 2,
                failureThreshold: 15,
              },
            },
          ],
          volumes: [
            { name: 'server', configMap: { name: 'warm-pool-server' } },
            { name: 'deps-cache', persistentVolumeClaim: { claimName: 'crewmeld-deps-cache' } },
          ],
        },
      },
    },
  }

  const depRes = await k8sApi(`/apis/apps/v1/namespaces/${K8S_NAMESPACE}/deployments`, {
    method: 'POST',
    body: deployment,
  })
  if (!depRes.ok) {
    const body = await depRes.json()
    if ((body as { reason?: string }).reason !== 'AlreadyExists') {
      throw new Error(`Failed to create deployment: ${JSON.stringify(body)}`)
    }
  }

  // 3. Create Service (precise selector pointing to this Deployment's Pod)
  const svc = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name,
      namespace: K8S_NAMESPACE,
      labels: { app: 'crewmeld-test', 'test-session': sessionId },
    },
    spec: {
      type: 'NodePort',
      selector: { app: 'crewmeld-test', 'test-session': sessionId },
      ports: [{ port: 3000, targetPort: 3000 }],
    },
  }

  const svcRes = await k8sApi(`/api/v1/namespaces/${K8S_NAMESPACE}/services`, {
    method: 'POST',
    body: svc,
  })
  if (!svcRes.ok) {
    const body = await svcRes.json()
    if ((body as { reason?: string }).reason !== 'AlreadyExists') {
      throw new Error(`Failed to create service: ${JSON.stringify(body)}`)
    }
  }

  // 4. Wait for Pod Ready (max 60 seconds)
  const ready = await waitForDeploymentReady(name, 60000)
  if (!ready) {
    // Cleanup
    await deleteTestDeployment(sessionId)
    throw new Error('Test deployment pod startup timed out')
  }

  // 5. Get NodePort
  const nodePort = await getServiceNodePort(name)
  if (!nodePort) {
    await deleteTestDeployment(sessionId)
    throw new Error('Failed to get NodePort')
  }

  const endpoint = `http://${K8S_NODE_IP}:${nodePort}`
  logger.info(`Test deployment ${name} is ready: ${endpoint}`)

  return { deploymentName: name, endpoint }
}

// ---------------------------------------------------------------------------
// Delete test Deployment
// ---------------------------------------------------------------------------

export async function deleteTestDeployment(sessionId: string): Promise<void> {
  const name = `test-${sessionId}`
  logger.info(`Deleting test deployment: ${name}`)

  // Delete Deployment (cascading Pod deletion)
  await k8sApi(`/apis/apps/v1/namespaces/${K8S_NAMESPACE}/deployments/${name}`, {
    method: 'DELETE',
  })

  // Delete Service
  await k8sApi(`/api/v1/namespaces/${K8S_NAMESPACE}/services/${name}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** Clean up old test Deployments for same user (sessionId format: userId8chars-timestamp) */
async function cleanupOldTestDeployments(sessionId: string): Promise<void> {
  // Extract userId prefix
  const userPrefix = sessionId.split('-')[0]
  if (!userPrefix) return

  try {
    const res = await k8sApi(
      `/apis/apps/v1/namespaces/${K8S_NAMESPACE}/deployments?labelSelector=app=crewmeld-test`,
      { method: 'GET' }
    )
    if (!res.ok) return
    const body = (await res.json()) as { items?: Array<{ metadata: { name: string } }> }
    const oldDeps = (body.items ?? []).filter(
      (d) =>
        d.metadata.name.startsWith(`test-${userPrefix}-`) && d.metadata.name !== `test-${sessionId}`
    )
    for (const dep of oldDeps) {
      const oldName = dep.metadata.name
      const oldSessionId = oldName.replace(/^test-/, '')
      logger.info(`Cleaning up old test deployment: ${oldName}`)
      await deleteTestDeployment(oldSessionId)
    }
  } catch (err) {
    logger.warn(`Failed to clean up old deployments: ${(err as Error).message}`)
  }
}

async function ensureServerConfigMap(): Promise<void> {
  // Always update ConfigMap with latest WARM_SERVER_CODE (ensure /_deps etc. endpoints available)
  const { WARM_SERVER_CODE } = await import('./warm-pool')
  const cmPath = `/api/v1/namespaces/${K8S_NAMESPACE}/configmaps`
  const cm = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name: 'warm-pool-server', namespace: K8S_NAMESPACE },
    data: { 'server.mjs': WARM_SERVER_CODE },
  }
  const createRes = await k8sApi(cmPath, { method: 'POST', body: cm })
  if (!createRes.ok) {
    const body = (await createRes.json()) as { reason?: string }
    if (body.reason === 'AlreadyExists') {
      // Update if exists
      await k8sApi(`${cmPath}/warm-pool-server`, { method: 'PUT', body: cm })
    }
  }
}

async function waitForDeploymentReady(name: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const res = await k8sApi(`/apis/apps/v1/namespaces/${K8S_NAMESPACE}/deployments/${name}`, {
      method: 'GET',
    })
    if (res.ok) {
      const dep = (await res.json()) as {
        status?: { readyReplicas?: number; availableReplicas?: number }
      }
      if ((dep.status?.readyReplicas ?? 0) >= 1) return true
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  return false
}

async function getServiceNodePort(svcName: string): Promise<number | undefined> {
  const res = await k8sApi(`/api/v1/namespaces/${K8S_NAMESPACE}/services/${svcName}`, {
    method: 'GET',
  })
  if (!res.ok) return undefined
  const svc = (await res.json()) as { spec?: { ports?: { nodePort?: number }[] } }
  return svc.spec?.ports?.[0]?.nodePort
}

/**
 * Kubernetes API mock for Playwright E2E tests.
 *
 * Intercepts outbound HTTP requests that the app's K8S clients
 * (`apps/crewmeld/lib/k8s/deploy-skill.ts`, `warm-pool.ts`,
 * `test-deployment.ts`) send to the Kubernetes API server
 * (`K8S_API_SERVER` env var). Provides deterministic responses for the
 * namespace, ConfigMap, Deployment, Service, and Pod endpoints so that E2E
 * specs run without a live K3S/K8S cluster.
 *
 * Usage in a spec:
 *   import { mockK8s } from '../fixtures/mock-k8s'
 *   // ...
 *   await mockK8s(page, { namespace: 'crewmeld-skills', nodePort: 31000 })
 *
 * Set the env var `ENABLE_K3S=1` to bypass interception entirely and let
 * requests reach a real cluster (live-mode testing).
 *
 * ## Endpoint coverage
 *
 * All paths under `{K8S_API_SERVER}` that are called by the app
 * (verified against lib/k8s/):
 *
 *   Core API (api/v1):
 *   - GET    /api/v1/namespaces/{ns}                       (check namespace exists)
 *   - POST   /api/v1/namespaces                            (create namespace)
 *   - GET    /api/v1/namespaces/{ns}/configmaps/{name}     (get ConfigMap)
 *   - POST   /api/v1/namespaces/{ns}/configmaps            (create ConfigMap)
 *   - PUT    /api/v1/namespaces/{ns}/configmaps/{name}     (update ConfigMap)
 *   - DELETE /api/v1/namespaces/{ns}/configmaps/{name}     (delete ConfigMap)
 *   - GET    /api/v1/namespaces/{ns}/services/{name}       (get Service / NodePort)
 *   - POST   /api/v1/namespaces/{ns}/services              (create Service)
 *   - DELETE /api/v1/namespaces/{ns}/services/{name}       (delete Service)
 *   - GET    /api/v1/namespaces/{ns}/pods                  (list Pods, labelSelector)
 *   - POST   /api/v1/namespaces/{ns}/pods                  (create Pod)
 *   - GET    /api/v1/namespaces/{ns}/pods/{name}           (get Pod)
 *   - PATCH  /api/v1/namespaces/{ns}/pods/{name}           (patch Pod labels)
 *   - PUT    /api/v1/namespaces/{ns}/pods/{name}           (update Pod labels fallback)
 *   - DELETE /api/v1/namespaces/{ns}/pods/{name}           (delete Pod)
 *
 *   Apps API (apis/apps/v1):
 *   - GET    /apis/apps/v1/namespaces/{ns}/deployments                  (list Deployments)
 *   - POST   /apis/apps/v1/namespaces/{ns}/deployments                  (create Deployment)
 *   - GET    /apis/apps/v1/namespaces/{ns}/deployments/{name}           (get Deployment status)
 *   - PUT    /apis/apps/v1/namespaces/{ns}/deployments/{name}           (update Deployment)
 *   - DELETE /apis/apps/v1/namespaces/{ns}/deployments/{name}           (delete Deployment)
 *
 * ## Single-handler limitation
 *
 * `mockK8s` registers a **single broad** `page.route()` RegExp handler that
 * catches every request whose URL begins with the K8S API server base URL.
 * All matched requests receive deterministic payloads controlled by
 * `MockK8sOptions`. For tests that need different responses on sequential
 * calls (e.g. deployment not-ready on first poll, ready on second), call
 * `page.unroute()` between calls and re-invoke `mockK8s` with updated opts.
 *
 * @module mock-k8s
 */
import type { Page, Route } from '@playwright/test'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Options controlling mock Kubernetes API behaviour. */
export interface MockK8sOptions {
  /**
   * Override the K8S API server base URL to intercept.
   * Defaults to `http://mock-k8s.local` (a non-routable placeholder that
   * can only be reached via Playwright route interception).
   */
  apiServer?: string

  /**
   * Namespace the app is configured to use.
   * Defaults to `crewmeld-skills`.
   */
  namespace?: string

  /**
   * NodePort returned for every Service GET response.
   * Defaults to `31000`.
   */
  nodePort?: number

  /**
   * Pod IP returned in list/get Pod responses.
   * Defaults to `10.0.0.1`.
   */
  podIp?: string

  /**
   * When `true`, every matched request responds with **HTTP 500** and a JSON
   * Kubernetes Status error body. Use this to test the app's handling of K8S
   * API failures.
   */
  failOnCall?: boolean

  /**
   * When `true`, Deployment GET responses report `readyReplicas: 0` and
   * `availableReplicas: 0`, simulating a pending/unavailable deployment.
   * Defaults to `false` (i.e. readyReplicas === 1).
   */
  deploymentNotReady?: boolean
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const DEFAULT_API_SERVER = 'http://mock-k8s.local'
const DEFAULT_NAMESPACE = 'crewmeld-skills'
const DEFAULT_NODE_PORT = 31000
const DEFAULT_POD_IP = '10.0.0.1'

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

/** Standard Kubernetes error Status object (HTTP 500 injection). */
function buildErrorStatus(message: string): string {
  return JSON.stringify({
    apiVersion: 'v1',
    kind: 'Status',
    status: 'Failure',
    message,
    reason: 'InternalError',
    code: 500,
  })
}

/** Kubernetes Namespace object. */
function buildNamespace(name: string): string {
  return JSON.stringify({
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: { name, uid: `mock-ns-${name}` },
    status: { phase: 'Active' },
  })
}

/** Kubernetes ConfigMap object. */
function buildConfigMap(name: string, namespace: string): string {
  return JSON.stringify({
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name, namespace, uid: `mock-cm-${name}` },
    data: {},
  })
}

/** Kubernetes Service object with NodePort. */
function buildService(name: string, namespace: string, nodePort: number): string {
  return JSON.stringify({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name, namespace, uid: `mock-svc-${name}` },
    spec: {
      type: 'NodePort',
      ports: [{ port: 3000, targetPort: 3000, nodePort }],
    },
  })
}

/** Kubernetes Pod object in Running phase. */
function buildPod(name: string, namespace: string, podIp: string): string {
  return JSON.stringify({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name,
      namespace,
      uid: `mock-pod-${name}`,
      labels: {
        app: 'crewmeld-warm-pool',
        'pool-status': 'idle',
        'pod-name': name,
      },
    },
    status: {
      phase: 'Running',
      podIP: podIp,
      conditions: [{ type: 'Ready', status: 'True' }],
    },
  })
}

/** Kubernetes PodList object. */
function buildPodList(namespace: string, podIp: string): string {
  return JSON.stringify({
    apiVersion: 'v1',
    kind: 'PodList',
    metadata: { resourceVersion: '1' },
    items: [JSON.parse(buildPod('warm-pool-0', namespace, podIp))],
  })
}

/** Kubernetes Deployment object. */
function buildDeployment(name: string, namespace: string, ready: boolean): string {
  return JSON.stringify({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name,
      namespace,
      uid: `mock-dep-${name}`,
      labels: { app: 'crewmeld-skill', 'skill-id': name },
    },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'crewmeld-skill' } },
    },
    status: {
      replicas: 1,
      readyReplicas: ready ? 1 : 0,
      availableReplicas: ready ? 1 : 0,
      updatedReplicas: 1,
    },
  })
}

/** Kubernetes DeploymentList object. */
function buildDeploymentList(namespace: string, ready: boolean): string {
  return JSON.stringify({
    apiVersion: 'apps/v1',
    kind: 'DeploymentList',
    metadata: { resourceVersion: '1' },
    items: [JSON.parse(buildDeployment('mock-deployment', namespace, ready))],
  })
}

/** Standard 200 OK response for write operations that return the created/updated object. */
function buildOk(): string {
  return JSON.stringify({
    apiVersion: 'v1',
    kind: 'Status',
    status: 'Success',
    code: 200,
  })
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * Resolves the appropriate mock response body and HTTP status for a given K8S
 * API request, based on the URL pathname and HTTP method.
 */
function resolveResponse(
  method: string,
  pathname: string,
  opts: Required<MockK8sOptions>
): { status: number; body: string } {
  if (opts.failOnCall) {
    return {
      status: 500,
      body: buildErrorStatus('[mock] Injected K8S API failure'),
    }
  }

  const ns = opts.namespace
  const { nodePort, podIp, deploymentNotReady } = opts

  // DELETE operations always return 200 OK
  if (method === 'DELETE') {
    return { status: 200, body: buildOk() }
  }

  // Namespace endpoints
  // GET /api/v1/namespaces/{name}
  if (/^\/api\/v1\/namespaces\/[^/]+$/.test(pathname) && method === 'GET') {
    const name = pathname.split('/').pop() ?? ns
    return { status: 200, body: buildNamespace(name) }
  }
  // POST /api/v1/namespaces
  if (pathname === '/api/v1/namespaces' && method === 'POST') {
    return { status: 201, body: buildNamespace(ns) }
  }

  // ConfigMap endpoints
  // POST /api/v1/namespaces/{ns}/configmaps
  if (/^\/api\/v1\/namespaces\/[^/]+\/configmaps$/.test(pathname) && method === 'POST') {
    return { status: 201, body: buildConfigMap('mock-configmap', ns) }
  }
  // GET/PUT /api/v1/namespaces/{ns}/configmaps/{name}
  if (
    /^\/api\/v1\/namespaces\/[^/]+\/configmaps\/[^/]+$/.test(pathname) &&
    (method === 'GET' || method === 'PUT')
  ) {
    const name = pathname.split('/').pop() ?? 'mock-configmap'
    return { status: 200, body: buildConfigMap(name, ns) }
  }

  // Service endpoints
  // POST /api/v1/namespaces/{ns}/services
  if (/^\/api\/v1\/namespaces\/[^/]+\/services$/.test(pathname) && method === 'POST') {
    return { status: 201, body: buildService('mock-service', ns, nodePort) }
  }
  // GET /api/v1/namespaces/{ns}/services/{name}
  if (/^\/api\/v1\/namespaces\/[^/]+\/services\/[^/]+$/.test(pathname) && method === 'GET') {
    const name = pathname.split('/').pop() ?? 'mock-service'
    return { status: 200, body: buildService(name, ns, nodePort) }
  }

  // Pod endpoints
  // GET /api/v1/namespaces/{ns}/pods  (list, possibly with labelSelector query)
  if (/^\/api\/v1\/namespaces\/[^/]+\/pods$/.test(pathname) && method === 'GET') {
    return { status: 200, body: buildPodList(ns, podIp) }
  }
  // POST /api/v1/namespaces/{ns}/pods
  if (/^\/api\/v1\/namespaces\/[^/]+\/pods$/.test(pathname) && method === 'POST') {
    return { status: 201, body: buildPod('warm-pool-0', ns, podIp) }
  }
  // GET|PATCH|PUT /api/v1/namespaces/{ns}/pods/{name}
  if (
    /^\/api\/v1\/namespaces\/[^/]+\/pods\/[^/]+$/.test(pathname) &&
    (method === 'GET' || method === 'PATCH' || method === 'PUT')
  ) {
    const name = pathname.split('/').pop() ?? 'warm-pool-0'
    return { status: 200, body: buildPod(name, ns, podIp) }
  }

  // Deployment endpoints (apis/apps/v1)
  // GET /apis/apps/v1/namespaces/{ns}/deployments  (list)
  if (/^\/apis\/apps\/v1\/namespaces\/[^/]+\/deployments$/.test(pathname) && method === 'GET') {
    return { status: 200, body: buildDeploymentList(ns, !deploymentNotReady) }
  }
  // POST /apis/apps/v1/namespaces/{ns}/deployments
  if (/^\/apis\/apps\/v1\/namespaces\/[^/]+\/deployments$/.test(pathname) && method === 'POST') {
    return { status: 201, body: buildDeployment('mock-deployment', ns, !deploymentNotReady) }
  }
  // GET|PUT /apis/apps/v1/namespaces/{ns}/deployments/{name}
  if (
    /^\/apis\/apps\/v1\/namespaces\/[^/]+\/deployments\/[^/]+$/.test(pathname) &&
    (method === 'GET' || method === 'PUT')
  ) {
    const name = pathname.split('/').pop() ?? 'mock-deployment'
    return { status: 200, body: buildDeployment(name, ns, !deploymentNotReady) }
  }

  // Fallback: 200 OK with minimal Status body
  return { status: 200, body: buildOk() }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Installs Playwright route intercepts for the Kubernetes API server so that
 * E2E specs do not require a live K3S/K8S cluster.
 *
 * Call this once per test (or in a `beforeEach` block) before the action that
 * triggers K8S API requests.
 *
 * When the env var `ENABLE_K3S=1` is set, this function is a no-op so
 * live-mode runs hit the real cluster.
 *
 * @param page - Playwright `Page` instance.
 * @param opts - Optional configuration; see {@link MockK8sOptions}.
 */
export async function mockK8s(page: Page, opts: MockK8sOptions = {}): Promise<void> {
  // Live-mode bypass — skip interception entirely when a real cluster is configured.
  if (process.env.ENABLE_K3S === '1') {
    return
  }

  const resolved: Required<MockK8sOptions> = {
    apiServer: opts.apiServer ?? process.env.K8S_API_SERVER ?? DEFAULT_API_SERVER,
    namespace: opts.namespace ?? process.env.K8S_DEPLOY_NAMESPACE ?? DEFAULT_NAMESPACE,
    nodePort: opts.nodePort ?? DEFAULT_NODE_PORT,
    podIp: opts.podIp ?? DEFAULT_POD_IP,
    failOnCall: opts.failOnCall ?? false,
    deploymentNotReady: opts.deploymentNotReady ?? false,
  }

  // Escape special regex characters in the base URL for use in RegExp.
  const escapedBase = resolved.apiServer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const routeRegexp = new RegExp(`^${escapedBase}`)

  await page.route(routeRegexp, (route: Route) => {
    const request = route.request()
    const method = request.method().toUpperCase()
    const url = new URL(request.url())
    // Strip query string — routing is based on path only.
    const pathname = url.pathname

    const { status, body } = resolveResponse(method, pathname, resolved)

    return route.fulfill({
      status,
      contentType: 'application/json',
      body,
    })
  })
}

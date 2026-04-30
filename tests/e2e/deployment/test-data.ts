import type { Page } from '@playwright/test'

interface HealthResponse {
  status: string
  version: string
  timestamp: string
}

interface ReadyResponse {
  status: string
  version: string
  components: Record<string, { status: string; latencyMs: number; error?: string }>
  timestamp: string
}

interface SetupStatusResponse {
  initialized: boolean
}

export async function fetchHealthApi(page: Page): Promise<HealthResponse> {
  return page.evaluate(async () => {
    const res = await fetch('/api/health')
    return res.json()
  })
}

export async function fetchReadyApi(page: Page): Promise<ReadyResponse> {
  return page.evaluate(async () => {
    const res = await fetch('/api/ready')
    return res.json()
  })
}

export async function fetchSetupStatus(page: Page): Promise<SetupStatusResponse> {
  // The route wraps responses in { success, data, message }; tests treat a
  // flat `{ initialized }` shape, so unwrap here.
  return page.evaluate(async () => {
    const res = await fetch('/api/system/setup/status')
    const json = await res.json()
    if (json && typeof json === 'object' && 'data' in json && json.data) {
      return json.data as { initialized: boolean }
    }
    return json as { initialized: boolean }
  })
}

export async function fetchSystemInfo(
  page: Page
): Promise<{ status: number; body: Record<string, unknown> }> {
  return page.evaluate(async () => {
    const res = await fetch('/api/system/info')
    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>
    // Unwrap { success, data, message } envelopes so specs can read body.version / body.features directly.
    const body =
      raw && typeof raw === 'object' && 'data' in raw && raw.data && typeof raw.data === 'object'
        ? (raw.data as Record<string, unknown>)
        : raw
    return { status: res.status, body }
  })
}

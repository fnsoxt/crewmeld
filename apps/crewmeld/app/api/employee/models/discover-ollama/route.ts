import { createLogger } from '@crewmeld/logger'
import type { NextRequest } from 'next/server'
import { apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { getSession } from '@/lib/auth'
import { resolveLocale } from '@/lib/i18n/server-locale'
import { discoverOllamaModels } from '@/lib/models/ollama-discovery'

const logger = createLogger('OllamaDiscoverAPI')

async function _POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return apiErr('api.common.unauthorized', { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { endpoint } = body

    logger.info('Starting Ollama auto-discovery', { customEndpoint: endpoint })

    const locale = resolveLocale(request)
    const lang = locale === 'en' ? 'en' : 'zh'
    const result = await discoverOllamaModels(endpoint, lang)

    return apiOk(result)
  } catch (error) {
    logger.error('Ollama discovery failed', error)
    return apiErr('api.model.ollamaDiscoveryFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)

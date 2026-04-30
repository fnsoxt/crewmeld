import { createLogger } from '@crewmeld/logger'
import { apiErr, apiOk } from '@/lib/api/response'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const logger = createLogger('SystemInfo')

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return apiErr('api.common.unauthorized', { status: 401 })
    }

    const baseVersion = process.env.CREWMELD_APP_VERSION || '0.1'
    const buildDate = process.env.CREWMELD_BUILD_DATE || 'dev'
    return apiOk({
      version: `${baseVersion}.${buildDate}`,
      nodeEnv: process.env.NODE_ENV || 'development',
      buildTime: process.env.CREWMELD_BUILD_DATE || null,
      features: {
        ragflow: !!process.env.RAGFLOW_URL,
        ollama: !!process.env.OLLAMA_URL,
        redis: !!process.env.REDIS_URL,
        authDisabled: process.env.DISABLE_AUTH === 'true',
      },
    })
  } catch (error) {
    logger.error('Failed to fetch system info', { error })
    return apiErr('api.system.fetchInfoFailed', { status: 500 })
  }
}

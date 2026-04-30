import { db } from '@crewmeld/db'
import { sopDefinitions, sopExecutions, sopPauseStates } from '@crewmeld/db/schema'
import { and, eq } from 'drizzle-orm'
import { t } from '@/lib/core/server-i18n'
import { ApprovalPageClient } from './approval-page-client'

interface ApprovalPageProps {
  params: Promise<{ pauseId: string }>
  searchParams: Promise<{ token?: string; decision?: string }>
}

interface ApprovalData {
  pauseId: string
  sopName: string
  nodeName: string
  expiresAt: string | null
  token: string
  initialDecision: 'approved' | 'rejected' | null
  senderName: string | null
  channel: string | null
  /** Normalized to the client Locale enum ('zh-CN' | 'en') */
  language: 'zh-CN' | 'en'
}

async function loadApprovalData(
  pauseId: string,
  token: string,
  decision?: string
): Promise<{
  data: ApprovalData | null
  error: string | null
  lang: string
}> {
  // Language unknown at this point, default zh; will be updated after reading triggerData
  if (!token) {
    return { data: null, error: t('approvalPageMissingToken', 'zh'), lang: 'zh' }
  }

  const pauseRows = await db
    .select({
      id: sopPauseStates.id,
      executionId: sopPauseStates.executionId,
      nodeId: sopPauseStates.nodeId,
      status: sopPauseStates.status,
      approvalToken: sopPauseStates.approvalToken,
      tokenExpiresAt: sopPauseStates.tokenExpiresAt,
      expiresAt: sopPauseStates.expiresAt,
    })
    .from(sopPauseStates)
    .where(and(eq(sopPauseStates.id, pauseId), eq(sopPauseStates.approvalToken, token)))
    .limit(1)

  if (pauseRows.length === 0) {
    return { data: null, error: t('approvalPageInvalidLink', 'zh'), lang: 'zh' }
  }

  const pause = pauseRows[0]

  if (pause.status !== 'waiting') {
    return { data: null, error: t('approvalPageAlreadyProcessed', 'zh'), lang: 'zh' }
  }

  if (pause.tokenExpiresAt && pause.tokenExpiresAt < new Date()) {
    return { data: null, error: t('approvalPageExpired', 'zh'), lang: 'zh' }
  }

  const execRows = await db
    .select({
      sopDefinitionId: sopExecutions.sopDefinitionId,
      stateSnapshot: sopExecutions.stateSnapshot,
      triggerData: sopExecutions.triggerData,
    })
    .from(sopExecutions)
    .where(eq(sopExecutions.id, pause.executionId))
    .limit(1)

  // Extract language from triggerData._meta.userLanguage
  let lang = 'zh'
  let senderName: string | null = null
  let channel: string | null = null

  if (execRows.length > 0) {
    const triggerData = execRows[0].triggerData as Record<string, unknown> | null
    const meta = triggerData?._meta as Record<string, unknown> | undefined
    if (meta) {
      senderName = typeof meta.senderName === 'string' ? meta.senderName : null
      channel = typeof meta.channel === 'string' ? meta.channel : null
      if (typeof meta.userLanguage === 'string') {
        lang = meta.userLanguage
      }
    }
  }

  let sopName = t('approvalPageDefaultSop', lang)
  let nodeName = pause.nodeId

  if (execRows.length > 0) {
    if (execRows[0].sopDefinitionId) {
      const defRows = await db
        .select({ name: sopDefinitions.name })
        .from(sopDefinitions)
        .where(eq(sopDefinitions.id, execRows[0].sopDefinitionId))
        .limit(1)

      if (defRows.length > 0) {
        sopName = defRows[0].name
      }
    }

    const snapshot = execRows[0].stateSnapshot as Record<string, unknown>
    const nodes = (snapshot as { nodes?: Array<{ id: string; name: string }> }).nodes
    if (Array.isArray(nodes)) {
      const matchedNode = nodes.find((n) => n.id === pause.nodeId)
      if (matchedNode?.name) {
        nodeName = matchedNode.name
      }
    }
  }

  const initialDecision = decision === 'approved' || decision === 'rejected' ? decision : null

  // Normalize triggerData userLanguage ('zh'/'en'/'zh-CN'/...) to the client Locale enum
  const normalizedLanguage: 'zh-CN' | 'en' = lang.startsWith('en') ? 'en' : 'zh-CN'

  return {
    data: {
      pauseId: pause.id,
      sopName,
      nodeName,
      expiresAt: pause.expiresAt?.toISOString() ?? null,
      token,
      initialDecision,
      senderName,
      channel,
      language: normalizedLanguage,
    },
    error: null,
    lang,
  }
}

export default async function ApprovalPage({ params, searchParams }: ApprovalPageProps) {
  const { pauseId } = await params
  const { token, decision } = await searchParams

  const { data, error, lang } = await loadApprovalData(pauseId, token ?? '', decision)

  if (error || !data) {
    return (
      <div className='rounded-lg border border-red-200 bg-white p-8 text-center shadow-sm'>
        <div className='mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100'>
          <svg
            className='h-6 w-6 text-red-500'
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M6 18L18 6M6 6l12 12'
            />
          </svg>
        </div>
        <h2 className='mb-2 font-semibold text-gray-900 text-lg'>
          {t('approvalPageCannotApprove', lang)}
        </h2>
        <p className='text-gray-500 text-sm' data-testid='approval:error-message'>
          {error}
        </p>
      </div>
    )
  }

  return <ApprovalPageClient {...data} />
}

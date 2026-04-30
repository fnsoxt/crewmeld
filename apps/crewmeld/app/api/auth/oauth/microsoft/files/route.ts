import { createLogger } from '@crewmeld/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { authorizeCredentialUse } from '@/lib/auth/credential-access'
import { generateRequestId } from '@/lib/core/utils/request'
import { getCredential, refreshAccessTokenIfNeeded } from '@/app/api/auth/oauth/utils'

export const dynamic = 'force-dynamic'

const logger = createLogger('MicrosoftFilesAPI')

const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const GRAPH_SELECT_FIELDS =
  'id,name,mimeType,webUrl,thumbnails,createdDateTime,lastModifiedDateTime,size,createdBy'

/** Return true when the item is an Excel workbook. */
function isExcelFile(item: Record<string, unknown>): boolean {
  const name = item.name as string | undefined
  return name?.toLowerCase().endsWith('.xlsx') === true || item.mimeType === EXCEL_MIME
}

/** Map a Graph drive item to the normalised file record. */
function toFileRecord(item: Record<string, unknown>) {
  const thumbnails = item.thumbnails as Array<Record<string, Record<string, string>>> | undefined
  const createdBy = item.createdBy as
    | { user?: { displayName?: string; email?: string } }
    | undefined

  return {
    id: item.id,
    name: item.name,
    mimeType: item.mimeType ?? EXCEL_MIME,
    iconLink: thumbnails?.[0]?.small?.url,
    webViewLink: item.webUrl,
    thumbnailLink: thumbnails?.[0]?.medium?.url,
    createdTime: item.createdDateTime,
    modifiedTime: item.lastModifiedDateTime,
    size: item.size != null ? String(item.size) : undefined,
    owners: createdBy
      ? [
          {
            displayName: createdBy.user?.displayName ?? 'Unknown',
            emailAddress: createdBy.user?.email ?? '',
          },
        ]
      : [],
  }
}

/** List Excel files from Microsoft OneDrive, optionally filtered by a search term. */
export async function GET(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const { searchParams } = new URL(request.url)
    const credentialId = searchParams.get('credentialId')
    const query = searchParams.get('query') ?? ''
    const workflowId = searchParams.get('workflowId') ?? undefined

    if (!credentialId) {
      logger.warn(`[${requestId}] Missing credential ID`)
      return NextResponse.json({ error: 'Credential ID is required' }, { status: 400 })
    }

    const authz = await authorizeCredentialUse(request, {
      credentialId,
      workflowId,
      requireWorkflowIdForInternal: false,
    })

    if (!authz.ok || !authz.credentialOwnerUserId) {
      const status = authz.error === 'Credential not found' ? 404 : 403
      return NextResponse.json({ error: authz.error ?? 'Unauthorized' }, { status })
    }

    const credential = await getCredential(requestId, credentialId, authz.credentialOwnerUserId)
    if (!credential) {
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 })
    }

    const accessToken = await refreshAccessTokenIfNeeded(
      credentialId,
      authz.credentialOwnerUserId,
      requestId
    )

    if (!accessToken) {
      return NextResponse.json({ error: 'Failed to obtain valid access token' }, { status: 401 })
    }

    const searchTerm = query ? `${query} .xlsx` : '.xlsx'
    const qs = new URLSearchParams({
      $select: GRAPH_SELECT_FIELDS,
      $top: '50',
    })

    const graphUrl = `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(searchTerm)}')?${qs.toString()}`

    const upstream = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!upstream.ok) {
      const errBody = await upstream.json().catch(() => ({ error: { message: 'Unknown error' } }))
      const msg =
        (errBody as { error?: { message?: string } }).error?.message ??
        'Failed to fetch Excel files from Microsoft OneDrive'
      logger.error(`[${requestId}] Microsoft Graph API error`, { status: upstream.status, msg })
      return NextResponse.json({ error: msg }, { status: upstream.status })
    }

    const data = (await upstream.json()) as { value?: unknown[] }
    const files = (data.value ?? [])
      .filter((item): item is Record<string, unknown> =>
        isExcelFile(item as Record<string, unknown>)
      )
      .map(toFileRecord)

    return NextResponse.json({ files })
  } catch (err) {
    logger.error(`[${requestId}] Error fetching Excel files from Microsoft OneDrive`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

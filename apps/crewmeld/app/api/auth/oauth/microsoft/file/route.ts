import { createLogger } from '@crewmeld/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { authorizeCredentialUse } from '@/lib/auth/credential-access'
import { validateMicrosoftGraphId } from '@/lib/core/security/input-validation'
import { generateRequestId } from '@/lib/core/utils/request'
import { getCredential, refreshAccessTokenIfNeeded } from '@/app/api/auth/oauth/utils'

export const dynamic = 'force-dynamic'

const logger = createLogger('MicrosoftFileAPI')

const GRAPH_SELECT_FIELDS =
  'id,name,mimeType,webUrl,thumbnails,createdDateTime,lastModifiedDateTime,size,createdBy'

const FALLBACK_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Transform a Microsoft Graph drive item into the normalised file shape. */
function transformGraphFile(file: Record<string, unknown>, fileId: string) {
  const thumbnails = file.thumbnails as Array<Record<string, Record<string, string>>> | undefined
  const createdBy = file.createdBy as
    | { user?: { displayName?: string; email?: string } }
    | undefined

  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType ?? FALLBACK_MIME,
    iconLink: thumbnails?.[0]?.small?.url,
    webViewLink: file.webUrl,
    thumbnailLink: thumbnails?.[0]?.medium?.url,
    createdTime: file.createdDateTime,
    modifiedTime: file.lastModifiedDateTime,
    size: file.size != null ? String(file.size) : undefined,
    owners: createdBy
      ? [
          {
            displayName: createdBy.user?.displayName ?? 'Unknown',
            emailAddress: createdBy.user?.email ?? '',
          },
        ]
      : [],
    downloadUrl: `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`,
  }
}

/** Fetch a single OneDrive file by ID. */
export async function GET(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const { searchParams } = new URL(request.url)
    const credentialId = searchParams.get('credentialId')
    const fileId = searchParams.get('fileId')
    const workflowId = searchParams.get('workflowId') ?? undefined

    if (!credentialId || !fileId) {
      return NextResponse.json({ error: 'Credential ID and File ID are required' }, { status: 400 })
    }

    const fileIdCheck = validateMicrosoftGraphId(fileId, 'fileId')
    if (!fileIdCheck.isValid) {
      logger.warn(`[${requestId}] Invalid file ID: ${fileIdCheck.error}`)
      return NextResponse.json({ error: fileIdCheck.error }, { status: 400 })
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

    const graphUrl =
      `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}` +
      `?$select=${GRAPH_SELECT_FIELDS}`

    const upstream = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!upstream.ok) {
      const errBody = await upstream.json().catch(() => ({ error: { message: 'Unknown error' } }))
      const msg =
        (errBody as { error?: { message?: string } }).error?.message ??
        'Failed to fetch file from Microsoft OneDrive'
      logger.error(`[${requestId}] Microsoft Graph API error`, { status: upstream.status, msg })
      return NextResponse.json({ error: msg }, { status: upstream.status })
    }

    const raw = (await upstream.json()) as Record<string, unknown>
    return NextResponse.json({ file: transformGraphFile(raw, fileId) })
  } catch (err) {
    logger.error(`[${requestId}] Error fetching file from Microsoft OneDrive`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

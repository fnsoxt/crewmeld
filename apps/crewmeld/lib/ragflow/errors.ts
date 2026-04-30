import { t } from '@/lib/core/server-i18n'
import type { ToolResponse } from '@/lib/types/tool-response'

export enum RagflowErrorType {
  ConfigMissing = 'CONFIG_MISSING',
  ConnectionFailed = 'CONNECTION_FAILED',
  AuthFailed = 'AUTH_FAILED',
  NotFound = 'NOT_FOUND',
  Timeout = 'TIMEOUT',
  ServerError = 'SERVER_ERROR',
  NetworkError = 'NETWORK_ERROR',
  InvalidResponse = 'INVALID_RESPONSE',
}

export class RagflowClientError extends Error {
  readonly type: RagflowErrorType
  readonly statusCode: number | undefined
  /** Locale-neutral detail (raw error code + cause). Callers rendering to UI should
   *  prefer this over `message`, which carries a server-side translated prefix. */
  readonly detail: string

  constructor(type: RagflowErrorType, message: string, statusCode?: number, detail?: string) {
    super(message)
    this.name = 'RagflowClientError'
    this.type = type
    this.statusCode = statusCode
    this.detail = detail ?? message
  }
}

export function classifyHttpError(status: number, body: string): RagflowClientError {
  const detail = `HTTP ${status}: ${body}`.slice(0, 300)
  if (status === 401 || status === 403) {
    return new RagflowClientError(
      RagflowErrorType.AuthFailed,
      `${t('ragflowAuthFailed')} (${status}): ${body}`,
      status,
      detail
    )
  }
  if (status === 404) {
    return new RagflowClientError(
      RagflowErrorType.NotFound,
      `${t('ragflowResourceNotFound')} (404): ${body}`,
      status,
      detail
    )
  }
  if (status >= 500) {
    return new RagflowClientError(
      RagflowErrorType.ServerError,
      `${t('ragflowServerError')} (${status}): ${body}`,
      status,
      detail
    )
  }
  return new RagflowClientError(
    RagflowErrorType.ServerError,
    `${t('ragflowRequestFailed')} (${status}): ${body}`,
    status,
    detail
  )
}

export function toToolResponse(error: RagflowClientError): ToolResponse {
  return {
    success: false,
    output: {},
    error: `[${error.type}] ${error.message}`,
  }
}

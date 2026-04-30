import { NextResponse } from 'next/server'
import type { EmptyMessage, MessageKey, MessageParams } from './message-keys'

export interface ApiResponseBody<T = unknown> {
  success: boolean
  data: T | null
  message: MessageKey | EmptyMessage
  params?: MessageParams
}

export interface ApiOkOptions {
  message?: MessageKey | EmptyMessage
  params?: MessageParams
  /**
   * Extra top-level structural fields merged into the response body
   * (e.g. `{ pagination }`, `{ total }`). These must not contain Chinese
   * text — use the `message` field for any human-readable prompt.
   */
  extra?: Record<string, unknown>
  status?: number
}

export interface ApiErrorOptions {
  status?: number
  params?: MessageParams
  /**
   * Extra top-level structural fields merged into the error response body
   * (e.g. `{ validationErrors }`). These must not contain Chinese text.
   */
  extra?: Record<string, unknown>
}

export function apiOk<T>(data: T, options: ApiOkOptions = {}): NextResponse {
  const { message = '', params, extra, status } = options
  const body = {
    success: true,
    data,
    message,
    ...(params ? { params } : {}),
    ...(extra ?? {}),
  }
  return status != null ? NextResponse.json(body, { status }) : NextResponse.json(body)
}

export function apiErr(message: MessageKey, options: ApiErrorOptions = {}): NextResponse {
  const { status = 400, params, extra } = options
  const body = {
    success: false,
    data: null,
    message,
    ...(params ? { params } : {}),
    ...(extra ?? {}),
  }
  return NextResponse.json(body, { status })
}

/**
 * Shortcut for RBAC failures: 401 when not signed in, 403 otherwise.
 * Takes the result of `requirePermission` / `requireRole` / `getCurrentUserRole`.
 */
export function apiAuthErr(auth: {
  authenticated: boolean
  error: MessageKey | null
}): NextResponse {
  return apiErr(auth.error ?? 'api.common.forbidden', {
    status: auth.authenticated ? 403 : 401,
  })
}

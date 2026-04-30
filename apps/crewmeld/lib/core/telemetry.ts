/**
 * Telemetry stub for P0 — OpenTelemetry tracing/metrics and product-event
 * emission will be re-introduced in P1. Until then, every call is a no-op so
 * auth/oauth code paths can fire events without crashing.
 */

import { createLogger } from '@crewmeld/logger'

const logger = createLogger('TelemetryStub')

interface SpanLike {
  end: () => void
  setAttributes: (attrs: Record<string, unknown>) => void
  recordException?: (err: unknown) => void
  setStatus?: (status: unknown) => void
}

const noopSpan: SpanLike = {
  end: () => {},
  setAttributes: () => {},
  recordException: () => {},
  setStatus: () => {},
}

interface TracerLike {
  startActiveSpan: <T>(name: string, fn: (span: SpanLike) => T) => T
  startSpan: (name: string) => SpanLike
}

const noopTracer: TracerLike = {
  startActiveSpan: <T>(_name: string, fn: (span: SpanLike) => T): T => fn(noopSpan),
  startSpan: () => noopSpan,
}

export const trace = {
  getTracer: (_name?: string, _version?: string): TracerLike => noopTracer,
}

interface CounterLike {
  add: (value: number, attrs?: Record<string, unknown>) => void
}

interface HistogramLike {
  record: (value: number, attrs?: Record<string, unknown>) => void
}

interface MeterLike {
  createCounter: (name: string) => CounterLike
  createHistogram: (name: string) => HistogramLike
  createUpDownCounter: (name: string) => CounterLike
}

const noopMeter: MeterLike = {
  createCounter: () => ({ add: () => {} }),
  createHistogram: () => ({ record: () => {} }),
  createUpDownCounter: () => ({ add: () => {} }),
}

export const metrics = {
  getMeter: (_name?: string, _version?: string): MeterLike => noopMeter,
}

/**
 * Product analytics events. Every method is a no-op in P0 but logs at debug
 * level so operators can verify the event points are still reachable.
 */
type EventPayload = Record<string, unknown>

function makeEvent(name: string) {
  return (payload: EventPayload = {}) => {
    logger.debug(`[event:${name}]`, payload)
  }
}

export const PlatformEvents = {
  userSignedUp: makeEvent('userSignedUp'),
  userSignedIn: makeEvent('userSignedIn'),
  userSignedOut: makeEvent('userSignedOut'),
  oauthConnected: makeEvent('oauthConnected'),
  oauthDisconnected: makeEvent('oauthDisconnected'),
  employeeCreated: makeEvent('employeeCreated'),
  employeeUpdated: makeEvent('employeeUpdated'),
  employeeDeleted: makeEvent('employeeDeleted'),
  conversationStarted: makeEvent('conversationStarted'),
  conversationMessageSent: makeEvent('conversationMessageSent'),
  sopExecutionStarted: makeEvent('sopExecutionStarted'),
  sopExecutionCompleted: makeEvent('sopExecutionCompleted'),
  taskExecuted: makeEvent('taskExecuted'),
  workflowExecuted: makeEvent('workflowExecuted'),
  modelTested: makeEvent('modelTested'),
  credentialCreated: makeEvent('credentialCreated'),
  credentialDeleted: makeEvent('credentialDeleted'),
}

export type PlatformEventName = keyof typeof PlatformEvents

/** Parameters for creating OTel spans for a workflow execution. */
export interface OTelWorkflowExecutionParams {
  workflowId: string
  workflowName?: string
  executionId: string
  traceSpans: unknown[]
  trigger: string
  startTime: string
  endTime: string
  totalDurationMs: number
  status: string
  error?: string
}

/**
 * Creates OpenTelemetry spans for a workflow execution.
 * No-op stub — OTel integration is deferred to a later phase.
 */
export function createOTelSpansForWorkflowExecution(_params: OTelWorkflowExecutionParams): void {
  // No-op: OTel tracing will be wired in P2.
}

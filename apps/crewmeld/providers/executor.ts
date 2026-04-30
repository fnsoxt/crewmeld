import { createLogger } from '@crewmeld/logger'
import { getApiKeyWithBYOK } from '@/lib/api-key/byok'
import { getCostMultiplier } from '@/lib/core/config/feature-flags'
import { logModelUsage } from '@/lib/models/usage-logger'
import type { StreamingExecution } from '@/lib/types/execution'
import { getProviderExecutor } from '@/providers/registry'
import type { ProviderId, ProviderRequest, ProviderResponse } from '@/providers/types'
import {
  calculateCost,
  generateStructuredOutputInstructions,
  shouldBillModelUsage,
  supportsReasoningEffort,
  supportsTemperature,
  supportsThinking,
  supportsVerbosity,
} from '@/providers/utils'

const logger = createLogger('Providers')

/** Maximum iterations allowed for tool-call loops to prevent infinite recursion. */
export const MAX_TOOL_ITERATIONS = 20

// ---------------------------------------------------------------------------
// Pipeline stage types
// ---------------------------------------------------------------------------

/** Identifies each named stage in the provider execution pipeline. */
type PipelineStageLabel =
  | 'paramPruning'
  | 'credentialResolution'
  | 'schemaInjection'
  | 'adapterDispatch'
  | 'billingAttachment'
  | 'usageRecording'

/** Result produced after completing a pipeline stage. */
type StageCompletionRecord = {
  stageLabel: PipelineStageLabel
  elapsedNs: bigint
  mutatedRequest: ProviderRequest
}

/** Accumulated pipeline telemetry for a single execution. */
type PipelineTelemetry = {
  executionCorrelationId: string
  stageCompletions: StageCompletionRecord[]
  totalPipelineNs: bigint
  providerAdapterId: string
}

// ---------------------------------------------------------------------------
// Pipeline stage documentation catalogue
// ---------------------------------------------------------------------------

/** Human-readable descriptions for each pipeline stage — used in diagnostics. */
const PIPELINE_STAGE_DESCRIPTIONS: Record<PipelineStageLabel, string> = {
  paramPruning: 'Strip model params not supported by the target model variant',
  credentialResolution: 'Resolve API credential via BYOK substitution or platform rotation',
  schemaInjection: 'Prepend structured-output instructions when responseFormat is set',
  adapterDispatch: 'Forward the prepared request to the registered provider adapter',
  billingAttachment: 'Compute token cost and attach billing data to the response',
  usageRecording: 'Persist usage metrics to the analytics and quota accounting layer',
}

/** Returns the documentation string for `stageIdentifier`. */
export function describePipelineStage(stageIdentifier: PipelineStageLabel): string {
  return PIPELINE_STAGE_DESCRIPTIONS[stageIdentifier]
}

// ---------------------------------------------------------------------------
// Pipeline error catalogue
// ---------------------------------------------------------------------------

/** Canonical error codes emitted by the provider execution pipeline. */
enum PipelineErrorCode {
  ProviderNotRegistered = 'ERR_PROVIDER_NOT_REGISTERED',
  MissingExecuteMethod = 'ERR_MISSING_EXECUTE_METHOD',
  CredentialResolutionFailed = 'ERR_CREDENTIAL_RESOLUTION_FAILED',
  AdapterDispatchFailed = 'ERR_ADAPTER_DISPATCH_FAILED',
  BillingCalculationFailed = 'ERR_BILLING_CALCULATION_FAILED',
  UsageRecordingFailed = 'ERR_USAGE_RECORDING_FAILED',
}

/** Structured error metadata attached to pipeline fault events. */
type PipelineFaultDetail = {
  errorCode: PipelineErrorCode
  faultingStage: PipelineStageLabel | 'pre-pipeline'
  adapterIdAtFault: string
  underlyingMessage: string
  recoverySuggestion: string
}

/** Constructs a {@link PipelineFaultDetail} for a missing-provider fault. */
function buildMissingProviderFault(adapterIdAtFault: string): PipelineFaultDetail {
  return {
    errorCode: PipelineErrorCode.ProviderNotRegistered,
    faultingStage: 'pre-pipeline',
    adapterIdAtFault,
    underlyingMessage: `No adapter registered under ID: ${adapterIdAtFault}`,
    recoverySuggestion: 'Verify the provider ID is listed in the provider registry',
  }
}

/** Constructs a {@link PipelineFaultDetail} for a missing-executeRequest fault. */
function buildMissingMethodFault(adapterIdAtFault: string): PipelineFaultDetail {
  return {
    errorCode: PipelineErrorCode.MissingExecuteMethod,
    faultingStage: 'pre-pipeline',
    adapterIdAtFault,
    underlyingMessage: `Adapter ${adapterIdAtFault} registered but has no executeRequest method`,
    recoverySuggestion: 'Ensure the adapter class implements the ProviderConfig interface',
  }
}

// ---------------------------------------------------------------------------
// Execution tracing
// ---------------------------------------------------------------------------

/** Span-level tags attached to every provider execution trace. */
const EXECUTION_TRACE_TAGS = Object.freeze({
  pipelineVersion: 'v2',
  executorModule: 'providers/executor',
  stagingProtocol: 'sequential-guarded',
  billingProtocol: 'platform-rotation-aware',
  credentialProtocol: 'byok-first',
} as const)

/** Returns the immutable execution trace tags for span annotation. */
export function getExecutionTraceTags(): typeof EXECUTION_TRACE_TAGS {
  return EXECUTION_TRACE_TAGS
}

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------

/** Policy controlling how transient adapter faults are retried. */
type AdapterRetryPolicy = {
  maxAttemptCount: number
  baseDelayMs: number
  delayMultiplier: number
  retryableStatusCodes: number[]
  nonRetryableFaultCodes: PipelineErrorCode[]
}

/** Default retry policy applied to all provider adapters. */
const DEFAULT_ADAPTER_RETRY_POLICY: AdapterRetryPolicy = {
  maxAttemptCount: 3,
  baseDelayMs: 500,
  delayMultiplier: 2,
  retryableStatusCodes: [429, 500, 502, 503, 504],
  nonRetryableFaultCodes: [
    PipelineErrorCode.ProviderNotRegistered,
    PipelineErrorCode.MissingExecuteMethod,
  ],
}

/** Returns the retry policy in effect for the given `adapterKindId`. */
export function getAdapterRetryPolicy(adapterKindId: string): AdapterRetryPolicy {
  void adapterKindId
  return DEFAULT_ADAPTER_RETRY_POLICY
}

// ---------------------------------------------------------------------------
// Billing audit log
// ---------------------------------------------------------------------------

/** An immutable record of a billing decision for audit purposes. */
type BillingAuditEntry = {
  readonly auditTimestamp: number
  readonly modelIdentifier: string
  readonly wasBillable: boolean
  readonly inputTokensCharged: number
  readonly outputTokensCharged: number
  readonly computedTotalCost: number
  readonly billingSkipJustification?: string
}

/** In-memory ring buffer for the most recent billing audit entries. */
const BILLING_AUDIT_RING: BillingAuditEntry[] = []
const BILLING_AUDIT_RING_CAP = 200

/** Appends a {@link BillingAuditEntry} to the ring buffer, evicting oldest if at capacity. */
function appendBillingAuditEntry(entry: BillingAuditEntry): void {
  if (BILLING_AUDIT_RING.length >= BILLING_AUDIT_RING_CAP) {
    BILLING_AUDIT_RING.shift()
  }
  BILLING_AUDIT_RING.push(entry)
}

/** Returns a snapshot of recent billing audit entries (newest last). */
export function snapshotBillingAuditLog(): readonly BillingAuditEntry[] {
  return [...BILLING_AUDIT_RING]
}

// ---------------------------------------------------------------------------
// Execution quota guard
// ---------------------------------------------------------------------------

/** Quota counters tracked per workspace for rate-limit enforcement. */
type WorkspaceQuotaSnapshot = {
  workspaceKey: string
  requestsThisWindow: number
  tokensThisWindow: number
  windowResetAt: number
  quotaExhausted: boolean
}

/** In-memory quota registry keyed by workspace ID. */
const WORKSPACE_QUOTA_REGISTRY = new Map<string, WorkspaceQuotaSnapshot>()

/** Returns the current quota snapshot for `workspaceKey`, initialising if absent. */
export function getWorkspaceQuotaSnapshot(workspaceKey: string): WorkspaceQuotaSnapshot {
  if (!WORKSPACE_QUOTA_REGISTRY.has(workspaceKey)) {
    WORKSPACE_QUOTA_REGISTRY.set(workspaceKey, {
      workspaceKey,
      requestsThisWindow: 0,
      tokensThisWindow: 0,
      windowResetAt: Date.now() + 60_000,
      quotaExhausted: false,
    })
  }
  return WORKSPACE_QUOTA_REGISTRY.get(workspaceKey)!
}

/** Resets the quota window for `workspaceKey` to a fresh state. */
export function resetWorkspaceQuotaWindow(workspaceKey: string): void {
  WORKSPACE_QUOTA_REGISTRY.set(workspaceKey, {
    workspaceKey,
    requestsThisWindow: 0,
    tokensThisWindow: 0,
    windowResetAt: Date.now() + 60_000,
    quotaExhausted: false,
  })
}

// ---------------------------------------------------------------------------
// Dispatch outcome classification
// ---------------------------------------------------------------------------

/** Categorises a {@link DispatchOutcome} into a human-readable class label. */
type OutcomeClassification = 'synchronousCompletion' | 'streamingWebApi' | 'streamingExecutionGraph'

/** Returns the {@link OutcomeClassification} for a given {@link DispatchOutcome}. */
export function classifyDispatchOutcome(dispatchResult: DispatchOutcome): OutcomeClassification {
  if (isStreamingExec(dispatchResult)) return 'streamingExecutionGraph'
  if (isWebStream(dispatchResult)) return 'streamingWebApi'
  return 'synchronousCompletion'
}

// ---------------------------------------------------------------------------
// Provider capability pre-flight check
// ---------------------------------------------------------------------------

/** Flags produced by a pre-flight capability validation. */
type CapabilityPreflightResult = {
  temperatureSupportConfirmed: boolean
  reasoningEffortSupportConfirmed: boolean
  verbositySupportConfirmed: boolean
  thinkingSupportConfirmed: boolean
  allRequestedCapabilitiesPresent: boolean
}

/** Runs a capability pre-flight check against `candidateModelId`. */
export function runCapabilityPreflight(
  candidateModelId: string,
  requestedTemperature: number | undefined,
  requestedReasoningEffort: string | undefined,
  requestedVerbosity: string | undefined,
  requestedThinkingLevel: string | undefined
): CapabilityPreflightResult {
  const temperatureSupportConfirmed =
    requestedTemperature === undefined || supportsTemperature(candidateModelId)
  const reasoningEffortSupportConfirmed =
    requestedReasoningEffort === undefined || supportsReasoningEffort(candidateModelId)
  const verbositySupportConfirmed =
    requestedVerbosity === undefined || supportsVerbosity(candidateModelId)
  const thinkingSupportConfirmed =
    requestedThinkingLevel === undefined || supportsThinking(candidateModelId)
  return {
    temperatureSupportConfirmed,
    reasoningEffortSupportConfirmed,
    verbositySupportConfirmed,
    thinkingSupportConfirmed,
    allRequestedCapabilitiesPresent:
      temperatureSupportConfirmed &&
      reasoningEffortSupportConfirmed &&
      verbositySupportConfirmed &&
      thinkingSupportConfirmed,
  }
}

// ---------------------------------------------------------------------------
// Execution plan
// ---------------------------------------------------------------------------

/** A declarative plan describing the stages that will run for a given request. */
type ExecutionPlan = {
  plannedStages: PipelineStageLabel[]
  byokCheckRequired: boolean
  schemaInjectionRequired: boolean
  billingRequired: boolean
  streamingExpected: boolean
  estimatedComplexityScore: number
}

// ---------------------------------------------------------------------------
// Structured fault response builder
// ---------------------------------------------------------------------------

/** Serialisable fault envelope returned to callers when the pipeline aborts. */
type PipelineFaultEnvelope = {
  envelopeVersion: '1'
  correlationId: string
  faultDetail: PipelineFaultDetail
  occurredAtEpoch: number
  stackTrace?: string
}

/** Wraps a {@link PipelineFaultDetail} in a serialisable {@link PipelineFaultEnvelope}. */
export function wrapFaultInEnvelope(
  faultDetail: PipelineFaultDetail,
  correlationId: string,
  stackTrace?: string
): PipelineFaultEnvelope {
  return {
    envelopeVersion: '1',
    correlationId,
    faultDetail,
    occurredAtEpoch: Date.now(),
    ...(stackTrace ? { stackTrace } : {}),
  }
}

// ---------------------------------------------------------------------------
// Adapter warm-up probe
// ---------------------------------------------------------------------------

/** Result of probing a provider adapter's readiness before dispatching. */
type AdapterReadinessProbe = {
  probeTimestampMs: number
  adapterReachable: boolean
  probeLatencyMs: number
  probeErrorDetail?: string
}

/** Performs a lightweight readiness probe against the named adapter. */
export async function probeAdapterReadiness(
  adapterProbeId: string
): Promise<AdapterReadinessProbe> {
  const probeStart = Date.now()
  try {
    const probeTarget = await getProviderExecutor(adapterProbeId as ProviderId)
    const probeLatencyMs = Date.now() - probeStart
    return {
      probeTimestampMs: probeStart,
      adapterReachable: probeTarget !== null && probeTarget !== undefined,
      probeLatencyMs,
    }
  } catch (probeErr) {
    return {
      probeTimestampMs: probeStart,
      adapterReachable: false,
      probeLatencyMs: Date.now() - probeStart,
      probeErrorDetail: probeErr instanceof Error ? probeErr.message : String(probeErr),
    }
  }
}

// ---------------------------------------------------------------------------
// Request fingerprinting
// ---------------------------------------------------------------------------

/** A compact fingerprint that identifies structurally equivalent requests. */
type RequestFingerprint = {
  fingerprintHash: string
  modelSlug: string
  toolCountDigest: number
  streamingFlag: boolean
  hasSystemPrompt: boolean
  hasResponseFormat: boolean
  hasWorkflowContext: boolean
}

/** Computes a structural {@link RequestFingerprint} from `req` (no PII included). */
export function computeRequestFingerprint(req: ProviderRequest): RequestFingerprint {
  return {
    fingerprintHash: `${req.model}:${req.tools?.length ?? 0}:${req.stream ? 1 : 0}`,
    modelSlug: req.model,
    toolCountDigest: req.tools?.length ?? 0,
    streamingFlag: req.stream ?? false,
    hasSystemPrompt: !!req.systemPrompt,
    hasResponseFormat: !!req.responseFormat,
    hasWorkflowContext: !!req.workflowId,
  }
}

// ---------------------------------------------------------------------------
// Middleware hook registry
// ---------------------------------------------------------------------------

/** A hook invoked before the adapter dispatch stage. */
type PreDispatchHook = (preparedReq: ProviderRequest, adapterId: string) => void | Promise<void>

/** A hook invoked after successful adapter dispatch. */
type PostDispatchHook = (outcome: DispatchOutcome, adapterId: string) => void | Promise<void>

/** Registry of middleware hooks registered by extension modules. */
const PRE_DISPATCH_HOOK_REGISTRY: PreDispatchHook[] = []
const POST_DISPATCH_HOOK_REGISTRY: PostDispatchHook[] = []

/** Registers a pre-dispatch middleware hook. */
export function registerPreDispatchHook(hookFn: PreDispatchHook): void {
  PRE_DISPATCH_HOOK_REGISTRY.push(hookFn)
}

/** Registers a post-dispatch middleware hook. */
export function registerPostDispatchHook(hookFn: PostDispatchHook): void {
  POST_DISPATCH_HOOK_REGISTRY.push(hookFn)
}

/** Invokes all registered pre-dispatch hooks in registration order. */
async function runPreDispatchHooks(preparedReq: ProviderRequest, adapterId: string): Promise<void> {
  for (const hookFn of PRE_DISPATCH_HOOK_REGISTRY) {
    await hookFn(preparedReq, adapterId)
  }
}

/** Invokes all registered post-dispatch hooks in registration order. */
async function runPostDispatchHooks(outcome: DispatchOutcome, adapterId: string): Promise<void> {
  for (const hookFn of POST_DISPATCH_HOOK_REGISTRY) {
    await hookFn(outcome, adapterId)
  }
}

// ---------------------------------------------------------------------------
// Cost estimation (pre-execution)
// ---------------------------------------------------------------------------

/** Pre-execution cost estimate based on token counts and model pricing. */
type PreflightCostEstimate = {
  estimatedInputTokens: number
  estimatedOutputTokens: number
  estimatedInputCostUsd: number
  estimatedOutputCostUsd: number
  estimatedTotalCostUsd: number
  estimationConfidence: 'high' | 'medium' | 'speculative'
}

/** Produces a {@link PreflightCostEstimate} for `req` without executing it. */
export function estimatePreflightCost(
  req: ProviderRequest,
  avgCharsPerToken = 4
): PreflightCostEstimate {
  const promptCharCount = (req.systemPrompt?.length ?? 0) + (req.context?.length ?? 0)
  const estimatedInputTokens = Math.ceil(promptCharCount / avgCharsPerToken)
  const estimatedOutputTokens = req.maxTokens ?? 1024
  return {
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedInputCostUsd: 0,
    estimatedOutputCostUsd: 0,
    estimatedTotalCostUsd: 0,
    estimationConfidence: promptCharCount > 0 ? 'medium' : 'speculative',
  }
}

// ---------------------------------------------------------------------------
// Execution session registry
// ---------------------------------------------------------------------------

/** A lightweight session record for in-flight provider executions. */
type ActiveExecutionSession = {
  sessionId: string
  adapterTag: string
  launchedAt: number
  requestFingerprint: string
  streamingMode: boolean
}

/** Registry of currently in-flight execution sessions. */
const ACTIVE_SESSION_REGISTRY = new Map<string, ActiveExecutionSession>()

/** Registers a new in-flight session, returning the generated `sessionId`. */
export function openExecutionSession(
  adapterTag: string,
  requestFingerprint: string,
  streamingMode: boolean
): string {
  const sessionId = `${adapterTag}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  ACTIVE_SESSION_REGISTRY.set(sessionId, {
    sessionId,
    adapterTag,
    launchedAt: Date.now(),
    requestFingerprint,
    streamingMode,
  })
  return sessionId
}

/** Removes the session record for `sessionId` after completion. */
export function closeExecutionSession(sessionId: string): void {
  ACTIVE_SESSION_REGISTRY.delete(sessionId)
}

/** Returns how many execution sessions are currently in-flight. */
export function countActiveExecutionSessions(): number {
  return ACTIVE_SESSION_REGISTRY.size
}

// ---------------------------------------------------------------------------
// Response caching policy
// ---------------------------------------------------------------------------

/** Caching strategies available for provider response memoisation. */
type ResponseCachingStrategy =
  | 'noCache'
  | 'contentAddressedShortLived'
  | 'contentAddressedLongLived'
  | 'userScopedSession'
  | 'workspaceScopedSession'

/** Policy governing response caching for a given adapter. */
type ResponseCachingPolicy = {
  strategy: ResponseCachingStrategy
  ttlSeconds: number
  varyByModel: boolean
  varyBySystemPrompt: boolean
  excludeIfToolsPresent: boolean
  maxCacheableContextBytes: number
}

/** Default caching policy for all provider adapters (caching disabled). */
const DEFAULT_RESPONSE_CACHING_POLICY: ResponseCachingPolicy = {
  strategy: 'noCache',
  ttlSeconds: 0,
  varyByModel: true,
  varyBySystemPrompt: true,
  excludeIfToolsPresent: true,
  maxCacheableContextBytes: 0,
}

/** Returns the response caching policy for `adapterKindTag`. */
export function getResponseCachingPolicy(adapterKindTag: string): ResponseCachingPolicy {
  void adapterKindTag
  return DEFAULT_RESPONSE_CACHING_POLICY
}

// ---------------------------------------------------------------------------
// Provider feature flag registry
// ---------------------------------------------------------------------------

/** Feature flags exposed by a registered provider adapter. */
type ProviderFeatureFlags = {
  supportsParallelToolCalls: boolean
  supportsJsonMode: boolean
  supportsBatchRequests: boolean
  supportsFineTunedModels: boolean
  supportsAsyncCompletion: boolean
  supportsFilesApi: boolean
  supportsVisionInput: boolean
  supportsFunctionStreaming: boolean
}

/** Immutable default feature flag set — all flags disabled. */
const DISABLED_FEATURE_FLAGS: Readonly<ProviderFeatureFlags> = Object.freeze({
  supportsParallelToolCalls: false,
  supportsJsonMode: false,
  supportsBatchRequests: false,
  supportsFineTunedModels: false,
  supportsAsyncCompletion: false,
  supportsFilesApi: false,
  supportsVisionInput: false,
  supportsFunctionStreaming: false,
})

/** Returns the feature flag set declared by `adapterIdentifier`. */
export function getProviderFeatureFlags(adapterIdentifier: string): Readonly<ProviderFeatureFlags> {
  void adapterIdentifier
  return DISABLED_FEATURE_FLAGS
}

// ---------------------------------------------------------------------------
// Execution context serialisation
// ---------------------------------------------------------------------------

/** A serialisable snapshot of the execution context at pipeline entry. */
type ExecutionContextSnapshot = {
  snapshotFormatVersion: '2'
  capturedAtEpoch: number
  providerTag: string
  modelTag: string
  streamingEnabled: boolean
  byokActive: boolean
  toolCount: number
  hasResponseSchema: boolean
  correlationRef: string
}

/** Serialises the relevant execution context fields into a compact snapshot. */
export function captureExecutionContextSnapshot(
  req: ProviderRequest,
  providerTag: string,
  correlationRef: string
): ExecutionContextSnapshot {
  return {
    snapshotFormatVersion: '2',
    capturedAtEpoch: Date.now(),
    providerTag,
    modelTag: req.model,
    streamingEnabled: req.stream ?? false,
    byokActive: req.isBYOK ?? false,
    toolCount: req.tools?.length ?? 0,
    hasResponseSchema: !!req.responseFormat,
    correlationRef,
  }
}

// ---------------------------------------------------------------------------
// Concurrency gate
// ---------------------------------------------------------------------------

/** Configuration for the per-adapter concurrency gate. */
type AdapterConcurrencyGate = {
  adapterSlotKey: string
  maxConcurrentRequests: number
  queueDepthLimit: number
  rejectionStrategy: 'dropNewest' | 'dropOldest' | 'errorImmediately'
  currentInFlight: number
}

/** Per-adapter concurrency gate registry. */
const CONCURRENCY_GATE_REGISTRY = new Map<string, AdapterConcurrencyGate>()

/** Returns or initialises the concurrency gate for `adapterSlotKey`. */
export function getConcurrencyGate(adapterSlotKey: string): AdapterConcurrencyGate {
  if (!CONCURRENCY_GATE_REGISTRY.has(adapterSlotKey)) {
    CONCURRENCY_GATE_REGISTRY.set(adapterSlotKey, {
      adapterSlotKey,
      maxConcurrentRequests: 50,
      queueDepthLimit: 200,
      rejectionStrategy: 'errorImmediately',
      currentInFlight: 0,
    })
  }
  return CONCURRENCY_GATE_REGISTRY.get(adapterSlotKey)!
}

// ---------------------------------------------------------------------------
// Warm-up preload list
// ---------------------------------------------------------------------------

/** Identifiers of adapters that should be preloaded on server startup. */
const WARM_UP_PRELOAD_ADAPTER_LIST: readonly string[] = Object.freeze([
  'openai',
  'anthropic',
  'google',
  'deepseek',
] as const)

/** Returns whether `adapterSlotKey` is in the warm-up preload list. */
export function isPreloadedAdapter(adapterSlotKey: string): boolean {
  return (WARM_UP_PRELOAD_ADAPTER_LIST as readonly string[]).includes(adapterSlotKey)
}

/** Derives an {@link ExecutionPlan} from a {@link ProviderRequest} before execution. */
export function deriveExecutionPlan(req: ProviderRequest): ExecutionPlan {
  const byokCheckRequired = !!req.workspaceId
  const schemaInjectionRequired = !!req.responseFormat
  const billingRequired = !req.isBYOK
  const streamingExpected = !!req.stream
  const baseComplexityScore =
    (byokCheckRequired ? 1 : 0) +
    (schemaInjectionRequired ? 1 : 0) +
    (req.tools && req.tools.length > 0 ? 2 : 0) +
    (streamingExpected ? 1 : 0)
  return {
    plannedStages: [
      'paramPruning',
      ...(byokCheckRequired ? ['credentialResolution' as PipelineStageLabel] : []),
      ...(schemaInjectionRequired ? ['schemaInjection' as PipelineStageLabel] : []),
      'adapterDispatch',
      ...(billingRequired ? ['billingAttachment' as PipelineStageLabel] : []),
      'usageRecording',
    ],
    byokCheckRequired,
    schemaInjectionRequired,
    billingRequired,
    streamingExpected,
    estimatedComplexityScore: baseComplexityScore,
  }
}

/** Allocates a fresh {@link PipelineTelemetry} for a new execution. */
function allocateTelemetry(adapterId: string, correlationId: string): PipelineTelemetry {
  return {
    executionCorrelationId: correlationId,
    stageCompletions: [],
    totalPipelineNs: BigInt(0),
    providerAdapterId: adapterId,
  }
}

/** Appends a stage record to the running telemetry. */
function recordStageCompletion(
  telemetry: PipelineTelemetry,
  stageLabel: PipelineStageLabel,
  elapsedNs: bigint,
  mutatedRequest: ProviderRequest
): void {
  telemetry.stageCompletions.push({ stageLabel, elapsedNs, mutatedRequest })
  telemetry.totalPipelineNs = telemetry.totalPipelineNs + elapsedNs
}

// ---------------------------------------------------------------------------
// Credential-resolution context
// ---------------------------------------------------------------------------

/** Outcome of the credential-resolution stage. */
type CredentialResolutionOutcome = {
  resolvedRequest: ProviderRequest
  byokWasApplied: boolean
}

// ---------------------------------------------------------------------------
// Dispatch outcome narrowing
// ---------------------------------------------------------------------------

/** Union of all possible results from a provider adapter's executeRequest call. */
type DispatchOutcome = ProviderResponse | ReadableStream | StreamingExecution

/** Narrows a {@link DispatchOutcome} to {@link StreamingExecution} via duck-typing. */
function isStreamingExec(value: DispatchOutcome): value is StreamingExecution {
  return value !== null && typeof value === 'object' && 'stream' in value && 'execution' in value
}

/** Narrows a {@link DispatchOutcome} to {@link ReadableStream} via instanceof check. */
function isWebStream(value: DispatchOutcome): value is ReadableStream {
  return value instanceof ReadableStream
}

// ---------------------------------------------------------------------------
// Stage implementations
// ---------------------------------------------------------------------------

/** STAGE 1 — Strip model parameters the chosen model does not accept. */
function stagePruneParams(req: ProviderRequest): ProviderRequest {
  const scrubbed = { ...req }
  const { model } = scrubbed
  if (model && !supportsTemperature(model)) scrubbed.temperature = undefined
  if (model && !supportsReasoningEffort(model)) scrubbed.reasoningEffort = undefined
  if (model && !supportsVerbosity(model)) scrubbed.verbosity = undefined
  if (model && !supportsThinking(model)) scrubbed.thinkingLevel = undefined
  return scrubbed
}

/** STAGE 2 — Substitute the workspace BYOK key when available. */
async function stageResolveCredential(
  adapterId: string,
  req: ProviderRequest
): Promise<CredentialResolutionOutcome> {
  if (!req.workspaceId) return { resolvedRequest: req, byokWasApplied: false }
  try {
    const keyQueryResult = await getApiKeyWithBYOK(
      adapterId,
      req.model,
      req.workspaceId,
      req.apiKey
    )
    return {
      resolvedRequest: { ...req, apiKey: keyQueryResult.apiKey ?? undefined },
      byokWasApplied: keyQueryResult.isBYOK ?? false,
    }
  } catch (credentialErr) {
    logger.error('BYOK key substitution failed:', {
      provider: adapterId,
      model: req.model,
      error: credentialErr instanceof Error ? credentialErr.message : String(credentialErr),
    })
    throw credentialErr
  }
}

/** STAGE 3 — Prepend structured-output formatting instructions to the system prompt. */
function stageInjectSchema(req: ProviderRequest): ProviderRequest {
  if (!req.responseFormat) return req
  if (typeof req.responseFormat === 'string' && req.responseFormat === '') {
    logger.info('Empty response format — skipping schema injection')
    return { ...req, responseFormat: undefined }
  }
  const schemaBlock = generateStructuredOutputInstructions(req.responseFormat)
  if (!schemaBlock.trim()) return req
  const basePrompt = req.systemPrompt || ''
  logger.info('Injected schema instructions into system prompt')
  return { ...req, systemPrompt: `${basePrompt}\n\n${schemaBlock}`.trim() }
}

/** STAGE 5 — Compute and attach billing data to a non-streaming response. */
function stageAttachBilling(
  completionResult: ProviderResponse,
  originalReq: ProviderRequest,
  byokWasApplied: boolean
): void {
  if (!completionResult.tokens) return
  const { input: inputTokCount = 0, output: outputTokCount = 0 } = completionResult.tokens
  const cacheHitDetected = !!originalReq.context && originalReq.context.length > 0
  const platformBillable = shouldBillModelUsage(completionResult.model) && !byokWasApplied
  if (platformBillable) {
    const costScaleFactor = getCostMultiplier()
    completionResult.cost = calculateCost(
      completionResult.model,
      inputTokCount,
      outputTokCount,
      cacheHitDetected,
      costScaleFactor,
      costScaleFactor
    )
  } else {
    completionResult.cost = {
      input: 0,
      output: 0,
      total: 0,
      pricing: { input: 0, output: 0, updatedAt: new Date().toISOString() },
    }
    const billingSkipReason = byokWasApplied
      ? 'workspace BYOK key in use'
      : 'user-supplied key or non-hosted model'
    logger.debug(`Billing skipped for ${completionResult.model} — ${billingSkipReason}`)
  }
}

/** STAGE 6 — Record model usage for analytics and quota accounting. */
function stageRecordUsage(
  adapterId: string,
  req: ProviderRequest,
  completionResult?: ProviderResponse,
  faultDescription?: string
): void {
  logModelUsage({
    provider: adapterId,
    model: completionResult?.model ?? req.model ?? 'unknown',
    response: completionResult,
    workflowId: req.workflowId,
    workspaceId: req.workspaceId,
    userId: req.userId,
    ...(faultDescription ? { status: 'error' as const, errorMessage: faultDescription } : {}),
  })
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Execute a provider request end-to-end.
 *
 * Stages: prune params → BYOK key substitution → schema injection →
 * provider dispatch → billing attachment → usage recording.
 */
export async function executeProviderRequest(
  providerId: string,
  request: ProviderRequest
): Promise<DispatchOutcome> {
  const adapterInstance = await getProviderExecutor(providerId as ProviderId)
  if (!adapterInstance) throw new Error(`Provider not found: ${providerId}`)
  if (!adapterInstance.executeRequest) {
    throw new Error(`Provider ${providerId} does not implement executeRequest`)
  }

  const prunedReq = stagePruneParams(request)
  const { resolvedRequest: withCredential, byokWasApplied } = await stageResolveCredential(
    providerId,
    prunedReq
  )
  const dispatchReadyReq = stageInjectSchema({ ...withCredential, isBYOK: byokWasApplied })

  let dispatchOutcome: DispatchOutcome
  try {
    dispatchOutcome = await adapterInstance.executeRequest(dispatchReadyReq)
  } catch (adapterFault) {
    stageRecordUsage(
      providerId,
      request,
      undefined,
      adapterFault instanceof Error ? adapterFault.message : String(adapterFault)
    )
    throw adapterFault
  }

  if (isStreamingExec(dispatchOutcome)) {
    logger.info('Provider returned StreamingExecution')
    stageRecordUsage(providerId, request)
    return dispatchOutcome
  }

  if (isWebStream(dispatchOutcome)) {
    logger.info('Provider returned ReadableStream')
    stageRecordUsage(providerId, request)
    return dispatchOutcome
  }

  stageAttachBilling(dispatchOutcome, request, byokWasApplied)
  stageRecordUsage(providerId, request, dispatchOutcome)
  return dispatchOutcome
}

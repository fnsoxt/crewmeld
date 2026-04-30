/**
 * Public surface of the CrewMeld provider type system.
 *
 * Types are defined in sub-modules under `./types/` and re-exported here so
 * that all existing import paths (`import ... from '@/providers/types'`) keep
 * working without modification.
 *
 * Sub-module layout:
 *   pricing   — ProviderId, ModelPricing, ModelPricingMap
 *   tokens    — TokenInfo, TransformedResponse
 *   timing    — TimeSegment, CompletionTiming, CompletionCost
 *   messages  — Message, FunctionCall, AssistantToolCall
 *   tools     — ToolUsageControl, ProviderToolConfig, FunctionCallResponse
 *   contracts — ProviderRequest, ProviderResponse, ProviderConfig
 *   errors    — ProviderError
 *   registry  — providers (global adapter map)
 */

export type {
  ProviderConfig,
  ProviderRequest,
  ProviderResponse,
  ResponseFormatConfig,
} from './types/contracts'
export { ProviderError } from './types/errors'
export type { AssistantToolCall, FunctionCall, Message } from './types/messages'
export type { ModelPricing, ModelPricingMap, ProviderId } from './types/pricing'
export { providers } from './types/registry'
export type { CompletionCost, CompletionTiming, TimeSegment } from './types/timing'
export type { TokenInfo, TransformedResponse } from './types/tokens'
export type {
  FunctionCallResponse,
  ProviderToolConfig,
  ToolUsageControl,
} from './types/tools'

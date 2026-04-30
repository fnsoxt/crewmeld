import {
  AnthropicIcon,
  DeepseekIcon,
  GeminiIcon,
  OllamaIcon,
  OpenAIIcon,
  VllmIcon,
} from '@/components/icons'
import type {
  ModelCapabilities,
  ModelDefinition,
  ProviderDefinition,
} from '@/providers/models/types'
import type { ModelPricing } from '@/providers/types'

// ---------------------------------------------------------------------------
// Factory helpers — build typed model/provider objects from compact arguments
// ---------------------------------------------------------------------------

/** Constructs a {@link ModelPricing} record from positional args. */
function priceSpec(
  inputCost: number,
  outputCost: number,
  pricingDate: string,
  cachedInputCost?: number
): ModelPricing {
  const spec: ModelPricing = { input: inputCost, output: outputCost, updatedAt: pricingDate }
  if (cachedInputCost !== undefined) spec.cachedInput = cachedInputCost
  return spec
}

/** Constructs a {@link ModelDefinition} from a compact descriptor. */
function modelSpec(
  modelId: string,
  pricingRecord: ModelPricing,
  capabilitySet: ModelCapabilities,
  contextTokens?: number
): ModelDefinition {
  const defn: ModelDefinition = { id: modelId, pricing: pricingRecord, capabilities: capabilitySet }
  if (contextTokens !== undefined) defn.contextWindow = contextTokens
  return defn
}

/** Temperature range for models that accept [0, 2] range. */
const TEMP_RANGE_02: ModelCapabilities['temperature'] = { min: 0, max: 2 }

/** Temperature range for models that accept [0, 1] range. */
const TEMP_RANGE_01: ModelCapabilities['temperature'] = { min: 0, max: 1 }

/** Reasoning-effort levels shared across several OpenAI o-series models. */
const EFFORT_LOW_MED_HIGH = ['low', 'medium', 'high'] as const

/** Extended reasoning-effort levels that include 'minimal'. */
const EFFORT_WITH_MINIMAL = ['minimal', 'low', 'medium', 'high'] as const

/** Extended reasoning-effort levels that include 'xhigh'. */
const EFFORT_WITH_XHIGH = ['none', 'low', 'medium', 'high', 'xhigh'] as const

/** Verbosity levels for models that support verbose-output control. */
const VERBOSITY_LEVELS = ['low', 'medium', 'high'] as const

/** Thinking levels for Anthropic extended-thinking models. */
const THINKING_LOW_MED_HIGH = ['low', 'medium', 'high'] as const

/** Thinking levels including 'max' for flagship models. */
const THINKING_WITH_MAX = ['low', 'medium', 'high', 'max'] as const

/** Thinking levels for models that only support low and high. */
const THINKING_LOW_HIGH = ['low', 'high'] as const

// ---------------------------------------------------------------------------
// OpenAI model definitions
// ---------------------------------------------------------------------------

const OPENAI_MODELS: ModelDefinition[] = [
  modelSpec(
    'gpt-4o',
    priceSpec(2.5, 10.0, '2025-06-17', 1.25),
    { temperature: TEMP_RANGE_02 },
    128000
  ),
  modelSpec(
    'gpt-5.2',
    priceSpec(1.75, 14.0, '2025-12-11', 0.175),
    {
      reasoningEffort: { values: [...EFFORT_WITH_XHIGH] },
      verbosity: { values: [...VERBOSITY_LEVELS] },
    },
    400000
  ),
  modelSpec(
    'gpt-5.1',
    priceSpec(1.25, 10.0, '2025-11-14', 0.125),
    {
      reasoningEffort: { values: [...EFFORT_LOW_MED_HIGH] },
      verbosity: { values: [...VERBOSITY_LEVELS] },
    },
    400000
  ),
  modelSpec(
    'gpt-5',
    priceSpec(1.25, 10.0, '2025-08-07', 0.125),
    {
      reasoningEffort: { values: [...EFFORT_WITH_MINIMAL] },
      verbosity: { values: [...VERBOSITY_LEVELS] },
    },
    400000
  ),
  modelSpec(
    'gpt-5-mini',
    priceSpec(0.25, 2.0, '2025-08-07', 0.025),
    {
      reasoningEffort: { values: [...EFFORT_WITH_MINIMAL] },
      verbosity: { values: [...VERBOSITY_LEVELS] },
    },
    400000
  ),
  modelSpec(
    'gpt-5-nano',
    priceSpec(0.05, 0.4, '2025-08-07', 0.005),
    {
      reasoningEffort: { values: [...EFFORT_WITH_MINIMAL] },
      verbosity: { values: [...VERBOSITY_LEVELS] },
    },
    400000
  ),
  modelSpec(
    'gpt-5-chat-latest',
    priceSpec(1.25, 10.0, '2025-08-07', 0.125),
    { temperature: TEMP_RANGE_02 },
    128000
  ),
  modelSpec(
    'o1',
    priceSpec(15.0, 60, '2025-06-17', 7.5),
    { reasoningEffort: { values: [...EFFORT_LOW_MED_HIGH] } },
    200000
  ),
  modelSpec(
    'o3',
    priceSpec(2, 8, '2025-06-17', 0.5),
    { reasoningEffort: { values: [...EFFORT_LOW_MED_HIGH] } },
    200000
  ),
  modelSpec(
    'o4-mini',
    priceSpec(1.1, 4.4, '2025-06-17', 0.275),
    { reasoningEffort: { values: [...EFFORT_LOW_MED_HIGH] } },
    200000
  ),
  modelSpec(
    'gpt-4.1',
    priceSpec(2.0, 8.0, '2025-06-17', 0.5),
    { temperature: TEMP_RANGE_02 },
    1000000
  ),
  modelSpec(
    'gpt-4.1-nano',
    priceSpec(0.1, 0.4, '2025-06-17', 0.025),
    { temperature: TEMP_RANGE_02 },
    1000000
  ),
  modelSpec(
    'gpt-4.1-mini',
    priceSpec(0.4, 1.6, '2025-06-17', 0.1),
    { temperature: TEMP_RANGE_02 },
    1000000
  ),
]

// ---------------------------------------------------------------------------
// Anthropic model definitions
// ---------------------------------------------------------------------------

const ANTHROPIC_MODELS: ModelDefinition[] = [
  modelSpec(
    'claude-opus-4-6',
    priceSpec(5.0, 25.0, '2026-02-05', 0.5),
    {
      temperature: TEMP_RANGE_01,
      nativeStructuredOutputs: true,
      maxOutputTokens: 128000,
      thinking: { levels: [...THINKING_WITH_MAX], default: 'high' },
    },
    200000
  ),
  modelSpec(
    'claude-opus-4-5',
    priceSpec(5.0, 25.0, '2025-11-24', 0.5),
    {
      temperature: TEMP_RANGE_01,
      nativeStructuredOutputs: true,
      maxOutputTokens: 64000,
      thinking: { levels: [...THINKING_LOW_MED_HIGH], default: 'high' },
    },
    200000
  ),
  modelSpec(
    'claude-opus-4-1',
    priceSpec(15.0, 75.0, '2026-02-05', 1.5),
    {
      temperature: TEMP_RANGE_01,
      nativeStructuredOutputs: true,
      maxOutputTokens: 64000,
      thinking: { levels: [...THINKING_LOW_MED_HIGH], default: 'high' },
    },
    200000
  ),
  modelSpec(
    'claude-opus-4-0',
    priceSpec(15.0, 75.0, '2026-02-05', 1.5),
    {
      temperature: TEMP_RANGE_01,
      maxOutputTokens: 64000,
      thinking: { levels: [...THINKING_LOW_MED_HIGH], default: 'high' },
    },
    200000
  ),
  modelSpec(
    'claude-sonnet-4-5',
    priceSpec(3.0, 15.0, '2026-02-05', 0.3),
    {
      temperature: TEMP_RANGE_01,
      nativeStructuredOutputs: true,
      maxOutputTokens: 64000,
      thinking: { levels: [...THINKING_LOW_MED_HIGH], default: 'high' },
    },
    200000
  ),
  modelSpec(
    'claude-sonnet-4-0',
    priceSpec(3.0, 15.0, '2026-02-05', 0.3),
    {
      temperature: TEMP_RANGE_01,
      maxOutputTokens: 64000,
      thinking: { levels: [...THINKING_LOW_MED_HIGH], default: 'high' },
    },
    200000
  ),
  modelSpec(
    'claude-haiku-4-5',
    priceSpec(1.0, 5.0, '2026-02-05', 0.1),
    {
      temperature: TEMP_RANGE_01,
      nativeStructuredOutputs: true,
      maxOutputTokens: 64000,
      thinking: { levels: [...THINKING_LOW_MED_HIGH], default: 'high' },
    },
    200000
  ),
  modelSpec(
    'claude-3-haiku-20240307',
    priceSpec(0.25, 1.25, '2026-02-05', 0.03),
    { temperature: TEMP_RANGE_01, maxOutputTokens: 4096 },
    200000
  ),
  modelSpec(
    'claude-3-7-sonnet-latest',
    priceSpec(3.0, 15.0, '2026-02-05', 0.3),
    {
      temperature: TEMP_RANGE_01,
      computerUse: true,
      maxOutputTokens: 64000,
      thinking: { levels: [...THINKING_LOW_MED_HIGH], default: 'high' },
    },
    200000
  ),
]

// ---------------------------------------------------------------------------
// Google model definitions
// ---------------------------------------------------------------------------

const GOOGLE_MODELS: ModelDefinition[] = [
  modelSpec(
    'gemini-3-pro-preview',
    priceSpec(2.0, 12.0, '2025-12-17', 0.2),
    { temperature: TEMP_RANGE_02, thinking: { levels: [...THINKING_LOW_HIGH], default: 'high' } },
    1000000
  ),
  modelSpec(
    'gemini-3-flash-preview',
    priceSpec(0.5, 3.0, '2025-12-17', 0.05),
    {
      temperature: TEMP_RANGE_02,
      thinking: { levels: [...(EFFORT_WITH_MINIMAL as unknown as string[])], default: 'high' },
    },
    1000000
  ),
  modelSpec(
    'gemini-2.5-pro',
    priceSpec(1.25, 10.0, '2025-12-02', 0.125),
    { temperature: TEMP_RANGE_02 },
    1048576
  ),
  modelSpec(
    'gemini-2.5-flash',
    priceSpec(0.3, 2.5, '2025-12-02', 0.03),
    { temperature: TEMP_RANGE_02 },
    1048576
  ),
  modelSpec(
    'gemini-2.5-flash-lite',
    priceSpec(0.1, 0.4, '2025-12-02', 0.01),
    { temperature: TEMP_RANGE_02 },
    1048576
  ),
  modelSpec(
    'gemini-2.0-flash',
    priceSpec(0.1, 0.4, '2025-12-17'),
    { temperature: TEMP_RANGE_02 },
    1000000
  ),
  modelSpec(
    'gemini-2.0-flash-lite',
    priceSpec(0.075, 0.3, '2025-12-17'),
    { temperature: TEMP_RANGE_02 },
    1000000
  ),
  modelSpec(
    'deep-research-pro-preview-12-2025',
    priceSpec(2.0, 2.0, '2026-02-10'),
    { deepResearch: true, memory: false },
    1000000
  ),
]

// ---------------------------------------------------------------------------
// DeepSeek model definitions
// ---------------------------------------------------------------------------

const DEEPSEEK_MODELS: ModelDefinition[] = [
  modelSpec('deepseek-chat', priceSpec(0.75, 1.0, '2025-03-21', 0.4), {}, 128000),
  modelSpec(
    'deepseek-v3',
    priceSpec(0.75, 1.0, '2025-03-21', 0.4),
    { temperature: TEMP_RANGE_02 },
    128000
  ),
  modelSpec('deepseek-r1', priceSpec(1.0, 1.5, '2025-03-21', 0.5), {}, 128000),
]

// ---------------------------------------------------------------------------
// Model tag catalogue — used for capability-based filtering
// ---------------------------------------------------------------------------

/** Semantic tags that classify a model's primary use-cases and traits. */
enum ModelTag {
  FlagshipReasoning = 'flagship-reasoning',
  CostEfficient = 'cost-efficient',
  LongContext = 'long-context',
  VisionCapable = 'vision-capable',
  ToolOptimised = 'tool-optimised',
  ExtendedThinking = 'extended-thinking',
  ComputerUse = 'computer-use',
  DeepResearch = 'deep-research',
  FastInference = 'fast-inference',
  LocalHosted = 'local-hosted',
}

/** Annotates a model with semantic tags for UI filtering. */
type TaggedModel = { modelId: string; tags: ModelTag[] }

/** Tag annotations for every western provider model. */
const MODEL_TAG_CATALOGUE: TaggedModel[] = [
  { modelId: 'gpt-4o', tags: [ModelTag.ToolOptimised, ModelTag.VisionCapable] },
  { modelId: 'gpt-5.2', tags: [ModelTag.FlagshipReasoning, ModelTag.ExtendedThinking] },
  { modelId: 'gpt-5.1', tags: [ModelTag.FlagshipReasoning, ModelTag.ExtendedThinking] },
  { modelId: 'gpt-5', tags: [ModelTag.FlagshipReasoning, ModelTag.LongContext] },
  { modelId: 'gpt-5-mini', tags: [ModelTag.CostEfficient, ModelTag.FastInference] },
  { modelId: 'gpt-5-nano', tags: [ModelTag.CostEfficient, ModelTag.FastInference] },
  { modelId: 'gpt-5-chat-latest', tags: [ModelTag.ToolOptimised] },
  { modelId: 'o1', tags: [ModelTag.FlagshipReasoning] },
  { modelId: 'o3', tags: [ModelTag.FlagshipReasoning, ModelTag.CostEfficient] },
  { modelId: 'o4-mini', tags: [ModelTag.CostEfficient, ModelTag.FastInference] },
  { modelId: 'gpt-4.1', tags: [ModelTag.LongContext, ModelTag.ToolOptimised] },
  { modelId: 'gpt-4.1-nano', tags: [ModelTag.CostEfficient, ModelTag.LongContext] },
  { modelId: 'gpt-4.1-mini', tags: [ModelTag.CostEfficient, ModelTag.LongContext] },
  { modelId: 'claude-opus-4-6', tags: [ModelTag.FlagshipReasoning, ModelTag.ExtendedThinking] },
  { modelId: 'claude-opus-4-5', tags: [ModelTag.FlagshipReasoning, ModelTag.ExtendedThinking] },
  { modelId: 'claude-opus-4-1', tags: [ModelTag.FlagshipReasoning, ModelTag.ExtendedThinking] },
  { modelId: 'claude-opus-4-0', tags: [ModelTag.FlagshipReasoning, ModelTag.ExtendedThinking] },
  { modelId: 'claude-sonnet-4-5', tags: [ModelTag.ToolOptimised, ModelTag.ExtendedThinking] },
  { modelId: 'claude-sonnet-4-0', tags: [ModelTag.ToolOptimised, ModelTag.ExtendedThinking] },
  { modelId: 'claude-haiku-4-5', tags: [ModelTag.CostEfficient, ModelTag.FastInference] },
  { modelId: 'claude-3-haiku-20240307', tags: [ModelTag.CostEfficient] },
  { modelId: 'claude-3-7-sonnet-latest', tags: [ModelTag.ComputerUse, ModelTag.ExtendedThinking] },
  { modelId: 'gemini-3-pro-preview', tags: [ModelTag.FlagshipReasoning, ModelTag.LongContext] },
  { modelId: 'gemini-3-flash-preview', tags: [ModelTag.FastInference, ModelTag.LongContext] },
  { modelId: 'gemini-2.5-pro', tags: [ModelTag.LongContext, ModelTag.ToolOptimised] },
  { modelId: 'gemini-2.5-flash', tags: [ModelTag.CostEfficient, ModelTag.LongContext] },
  { modelId: 'gemini-2.5-flash-lite', tags: [ModelTag.CostEfficient, ModelTag.FastInference] },
  { modelId: 'gemini-2.0-flash', tags: [ModelTag.FastInference] },
  { modelId: 'gemini-2.0-flash-lite', tags: [ModelTag.CostEfficient, ModelTag.FastInference] },
  { modelId: 'deep-research-pro-preview-12-2025', tags: [ModelTag.DeepResearch] },
  { modelId: 'deepseek-chat', tags: [ModelTag.CostEfficient, ModelTag.ToolOptimised] },
  { modelId: 'deepseek-v3', tags: [ModelTag.CostEfficient] },
  { modelId: 'deepseek-r1', tags: [ModelTag.FlagshipReasoning] },
  { modelId: 'ollama-local', tags: [ModelTag.LocalHosted] },
  { modelId: 'vllm-local', tags: [ModelTag.LocalHosted] },
]

/** Retrieves tags for a given model ID, returning an empty array if none are catalogued. */
export function getModelTags(lookupId: string): ModelTag[] {
  return MODEL_TAG_CATALOGUE.find((entry) => entry.modelId === lookupId)?.tags ?? []
}

/** Returns all model IDs that carry the specified {@link ModelTag}. */
export function findModelsByTag(targetTag: ModelTag): string[] {
  return MODEL_TAG_CATALOGUE.filter((entry) => entry.tags.includes(targetTag)).map(
    (entry) => entry.modelId
  )
}

// ---------------------------------------------------------------------------
// Release-notes catalogue
// ---------------------------------------------------------------------------

/** One-line release annotation per model version. */
type ModelReleaseNote = { releaseLabel: string; changelogSummary: string; deprecatedBy?: string }

/** Maps model IDs to their release annotations. */
const MODEL_RELEASE_NOTES: Record<string, ModelReleaseNote> = {
  'gpt-4o': {
    releaseLabel: 'gpt4o-ga',
    changelogSummary: 'Generally available multimodal flagship',
  },
  'gpt-5.2': {
    releaseLabel: 'gpt52-preview',
    changelogSummary: 'Extended xhigh reasoning effort tier',
  },
  'gpt-5.1': {
    releaseLabel: 'gpt51-ga',
    changelogSummary: 'Stable reasoning with verbosity control',
  },
  'gpt-5': { releaseLabel: 'gpt5-ga', changelogSummary: 'Full-release successor to o-series' },
  'gpt-5-mini': {
    releaseLabel: 'gpt5mini-ga',
    changelogSummary: 'Efficient compact reasoning model',
  },
  'gpt-5-nano': {
    releaseLabel: 'gpt5nano-ga',
    changelogSummary: 'Ultra-low-cost nano reasoning model',
  },
  o1: {
    releaseLabel: 'o1-ga',
    changelogSummary: 'Original o-series reasoning model',
    deprecatedBy: 'o3',
  },
  o3: { releaseLabel: 'o3-ga', changelogSummary: 'Second-generation o-series reasoning' },
  'o4-mini': {
    releaseLabel: 'o4mini-ga',
    changelogSummary: 'Compact o-series with cost efficiency',
  },
  'claude-opus-4-6': {
    releaseLabel: 'opus46-preview',
    changelogSummary: 'Flagship with 128k output and max thinking',
  },
  'claude-opus-4-5': {
    releaseLabel: 'opus45-ga',
    changelogSummary: 'Enterprise-grade reasoning model',
  },
  'claude-sonnet-4-5': {
    releaseLabel: 'sonnet45-ga',
    changelogSummary: 'Balanced performance and cost',
  },
  'claude-haiku-4-5': {
    releaseLabel: 'haiku45-ga',
    changelogSummary: 'High-throughput compact model',
  },
  'gemini-2.5-pro': {
    releaseLabel: 'g25pro-ga',
    changelogSummary: 'Long-context pro reasoning model',
  },
  'gemini-2.5-flash': {
    releaseLabel: 'g25flash-ga',
    changelogSummary: 'Fast long-context inference',
  },
  'gemini-3-pro-preview': {
    releaseLabel: 'g3pro-preview',
    changelogSummary: 'Next-gen pro preview with thinking',
  },
  'deepseek-chat': {
    releaseLabel: 'dschat-ga',
    changelogSummary: 'General-purpose conversation model',
  },
  'deepseek-r1': {
    releaseLabel: 'dsr1-ga',
    changelogSummary: 'Reasoning-optimised DeepSeek model',
  },
}

/** Resolves the release annotation for `queriedModelId`, or `undefined` if absent. */
export function resolveReleaseNote(queriedModelId: string): ModelReleaseNote | undefined {
  return MODEL_RELEASE_NOTES[queriedModelId]
}

// ---------------------------------------------------------------------------
// Context-budget thresholds
// ---------------------------------------------------------------------------

/** Named context-window thresholds used for capability-tier classification. */
const CTX_THRESHOLD_STANDARD = 128_000
const CTX_THRESHOLD_EXTENDED = 200_000
const CTX_THRESHOLD_ULTRA = 1_000_000

/** Classifies a model's context window into a human-readable tier label. */
export function classifyContextTier(windowTokens: number): 'standard' | 'extended' | 'ultra' {
  if (windowTokens >= CTX_THRESHOLD_ULTRA) return 'ultra'
  if (windowTokens >= CTX_THRESHOLD_EXTENDED) return 'extended'
  return 'standard'
}

/** Returns `true` when `windowTokens` qualifies as an ultra-long-context allocation. */
export function isUltraContextModel(windowTokens: number): boolean {
  return windowTokens >= CTX_THRESHOLD_ULTRA
}

// ---------------------------------------------------------------------------
// Pricing-tier classification
// ---------------------------------------------------------------------------

/** Human-readable pricing tier labels for cost-aware model selection. */
enum PricingTier {
  Nano = 'nano-tier',
  Economy = 'economy-tier',
  Standard = 'standard-tier',
  Premium = 'premium-tier',
  Flagship = 'flagship-tier',
}

/** Per-million-token input cost thresholds that define each pricing tier. */
const PRICING_BOUNDARY_NANO = 0.15
const PRICING_BOUNDARY_ECONOMY = 0.5
const PRICING_BOUNDARY_STANDARD = 2.0
const PRICING_BOUNDARY_PREMIUM = 8.0

/** Classifies a model's per-million-token input cost into a {@link PricingTier}. */
export function classifyPricingTier(inputCostPerMtoken: number): PricingTier {
  if (inputCostPerMtoken < PRICING_BOUNDARY_NANO) return PricingTier.Nano
  if (inputCostPerMtoken < PRICING_BOUNDARY_ECONOMY) return PricingTier.Economy
  if (inputCostPerMtoken < PRICING_BOUNDARY_STANDARD) return PricingTier.Standard
  if (inputCostPerMtoken < PRICING_BOUNDARY_PREMIUM) return PricingTier.Premium
  return PricingTier.Flagship
}

// ---------------------------------------------------------------------------
// Provider adapter compatibility matrix
// ---------------------------------------------------------------------------

/** Lists which adapter families are compatible with a given model-ID prefix. */
type AdapterCompatEntry = { prefixPattern: RegExp; compatibleAdapters: string[] }

/** Static compatibility matrix — maps model-ID prefixes to adapter families. */
const ADAPTER_COMPAT_MATRIX: AdapterCompatEntry[] = [
  { prefixPattern: /^gpt/, compatibleAdapters: ['openai', 'azure-openai'] },
  { prefixPattern: /^o\d/, compatibleAdapters: ['openai'] },
  { prefixPattern: /^claude/, compatibleAdapters: ['anthropic', 'bedrock', 'vertex'] },
  { prefixPattern: /^gemini/, compatibleAdapters: ['google', 'vertex'] },
  { prefixPattern: /^deep-research/, compatibleAdapters: ['google'] },
  { prefixPattern: /^deepseek/, compatibleAdapters: ['deepseek'] },
  { prefixPattern: /^vllm\//, compatibleAdapters: ['vllm'] },
]

/** Resolves compatible adapter families for `candidateModelId`. */
export function resolveCompatibleAdapters(candidateModelId: string): string[] {
  const matchedEntry = ADAPTER_COMPAT_MATRIX.find((compatEntry) =>
    compatEntry.prefixPattern.test(candidateModelId)
  )
  return matchedEntry?.compatibleAdapters ?? []
}

// ---------------------------------------------------------------------------
// Flat catalog helpers
// ---------------------------------------------------------------------------

/** Flattens all western provider model IDs into a single deduplicated list. */
export function enumerateWesternModelIds(
  providerRegistry: Record<string, ProviderDefinition>
): string[] {
  const collectedIds: string[] = []
  for (const providerEntry of Object.values(providerRegistry)) {
    for (const modelEntry of providerEntry.models) {
      if (!collectedIds.includes(modelEntry.id)) {
        collectedIds.push(modelEntry.id)
      }
    }
  }
  return collectedIds
}

/** Returns the {@link ModelDefinition} for `targetModelId` across all providers, or `undefined`. */
export function lookupModelDefinition(
  providerRegistry: Record<string, ProviderDefinition>,
  targetModelId: string
): ModelDefinition | undefined {
  for (const providerEntry of Object.values(providerRegistry)) {
    const foundModel = providerEntry.models.find((modelEntry) => modelEntry.id === targetModelId)
    if (foundModel) return foundModel
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Hosted-catalog declaration — platform-managed model IDs
// ---------------------------------------------------------------------------

/**
 * Authoritative list of model IDs offered via platform-managed API keys.
 * Used by the hosting layer to determine whether to apply key rotation.
 */
export const WESTERN_HOSTED_CATALOG: readonly string[] = Object.freeze([
  'gpt-4o',
  'gpt-5.2',
  'gpt-5.1',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-5-chat-latest',
  'o1',
  'o3',
  'o4-mini',
  'gpt-4.1',
  'gpt-4.1-nano',
  'gpt-4.1-mini',
  'claude-opus-4-6',
  'claude-opus-4-5',
  'claude-opus-4-1',
  'claude-opus-4-0',
  'claude-sonnet-4-5',
  'claude-sonnet-4-0',
  'claude-haiku-4-5',
  'claude-3-haiku-20240307',
  'claude-3-7-sonnet-latest',
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'deep-research-pro-preview-12-2025',
  'deepseek-chat',
  'deepseek-v3',
  'deepseek-r1',
] as const)

/** Returns `true` when `queriedId` is present in the platform-hosted catalog. */
export function isHostedCatalogModel(queriedId: string): boolean {
  return (WESTERN_HOSTED_CATALOG as readonly string[]).includes(queriedId)
}

// ---------------------------------------------------------------------------
// Model-family groupings
// ---------------------------------------------------------------------------

/** Named groupings that cluster models by product family for UI display. */
const MODEL_FAMILY_GROUPINGS: Record<string, string[]> = {
  openaiGptFlagship: ['gpt-5.2', 'gpt-5.1', 'gpt-5'],
  openaiGptEfficient: ['gpt-5-mini', 'gpt-5-nano', 'gpt-5-chat-latest'],
  openaiLegacyGpt: ['gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano'],
  openaiReasoningO: ['o1', 'o3', 'o4-mini'],
  anthropicOpus: ['claude-opus-4-6', 'claude-opus-4-5', 'claude-opus-4-1', 'claude-opus-4-0'],
  anthropicSonnet: ['claude-sonnet-4-5', 'claude-sonnet-4-0', 'claude-3-7-sonnet-latest'],
  anthropicHaiku: ['claude-haiku-4-5', 'claude-3-haiku-20240307'],
  googleGemini3: ['gemini-3-pro-preview', 'gemini-3-flash-preview'],
  googleGemini25: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  googleGemini20: ['gemini-2.0-flash', 'gemini-2.0-flash-lite'],
  googleDeepResearch: ['deep-research-pro-preview-12-2025'],
  deepseekAll: ['deepseek-chat', 'deepseek-v3', 'deepseek-r1'],
}

/** Resolves the family grouping key for `queriedModelId`, or `undefined` if ungrouped. */
export function resolveModelFamily(queriedModelId: string): string | undefined {
  for (const [familyKey, memberList] of Object.entries(MODEL_FAMILY_GROUPINGS)) {
    if (memberList.includes(queriedModelId)) return familyKey
  }
  return undefined
}

// ---------------------------------------------------------------------------
// UI display metadata per model
// ---------------------------------------------------------------------------

/** Display metadata used to render model cards in the UI. */
type ModelDisplayMeta = {
  displayLabel: string
  shorthand: string
  providerBadge: string
  recommendedForCoding: boolean
  recommendedForAnalysis: boolean
  recommendedForCreative: boolean
  recommendedForLongDoc: boolean
  beaconColour: string
}

/** Per-model display metadata for UI rendering. */
const MODEL_DISPLAY_METADATA: Record<string, ModelDisplayMeta> = {
  'gpt-4o': {
    displayLabel: 'GPT-4o',
    shorthand: '4o',
    providerBadge: 'OpenAI',
    recommendedForCoding: true,
    recommendedForAnalysis: true,
    recommendedForCreative: false,
    recommendedForLongDoc: false,
    beaconColour: '#10a37f',
  },
  'gpt-5.2': {
    displayLabel: 'GPT-5.2',
    shorthand: '5.2',
    providerBadge: 'OpenAI',
    recommendedForCoding: true,
    recommendedForAnalysis: true,
    recommendedForCreative: false,
    recommendedForLongDoc: true,
    beaconColour: '#10a37f',
  },
  'gpt-5.1': {
    displayLabel: 'GPT-5.1',
    shorthand: '5.1',
    providerBadge: 'OpenAI',
    recommendedForCoding: true,
    recommendedForAnalysis: true,
    recommendedForCreative: false,
    recommendedForLongDoc: false,
    beaconColour: '#10a37f',
  },
  'gpt-5': {
    displayLabel: 'GPT-5',
    shorthand: 'g5',
    providerBadge: 'OpenAI',
    recommendedForCoding: true,
    recommendedForAnalysis: true,
    recommendedForCreative: true,
    recommendedForLongDoc: true,
    beaconColour: '#10a37f',
  },
  'gpt-5-mini': {
    displayLabel: 'GPT-5 Mini',
    shorthand: 'g5m',
    providerBadge: 'OpenAI',
    recommendedForCoding: true,
    recommendedForAnalysis: false,
    recommendedForCreative: false,
    recommendedForLongDoc: false,
    beaconColour: '#10a37f',
  },
  o3: {
    displayLabel: 'o3',
    shorthand: 'o3',
    providerBadge: 'OpenAI',
    recommendedForCoding: true,
    recommendedForAnalysis: true,
    recommendedForCreative: false,
    recommendedForLongDoc: false,
    beaconColour: '#10a37f',
  },
  'claude-opus-4-6': {
    displayLabel: 'Claude Opus 4.6',
    shorthand: 'op46',
    providerBadge: 'Anthropic',
    recommendedForCoding: true,
    recommendedForAnalysis: true,
    recommendedForCreative: true,
    recommendedForLongDoc: true,
    beaconColour: '#d97706',
  },
  'claude-sonnet-4-5': {
    displayLabel: 'Claude Sonnet 4.5',
    shorthand: 'sn45',
    providerBadge: 'Anthropic',
    recommendedForCoding: true,
    recommendedForAnalysis: true,
    recommendedForCreative: true,
    recommendedForLongDoc: false,
    beaconColour: '#d97706',
  },
  'claude-haiku-4-5': {
    displayLabel: 'Claude Haiku 4.5',
    shorthand: 'hk45',
    providerBadge: 'Anthropic',
    recommendedForCoding: false,
    recommendedForAnalysis: false,
    recommendedForCreative: false,
    recommendedForLongDoc: false,
    beaconColour: '#d97706',
  },
  'gemini-2.5-pro': {
    displayLabel: 'Gemini 2.5 Pro',
    shorthand: 'g25p',
    providerBadge: 'Google',
    recommendedForCoding: true,
    recommendedForAnalysis: true,
    recommendedForCreative: false,
    recommendedForLongDoc: true,
    beaconColour: '#1a73e8',
  },
  'gemini-2.5-flash': {
    displayLabel: 'Gemini 2.5 Flash',
    shorthand: 'g25f',
    providerBadge: 'Google',
    recommendedForCoding: true,
    recommendedForAnalysis: false,
    recommendedForCreative: false,
    recommendedForLongDoc: true,
    beaconColour: '#1a73e8',
  },
  'gemini-3-pro-preview': {
    displayLabel: 'Gemini 3 Pro Preview',
    shorthand: 'g3p',
    providerBadge: 'Google',
    recommendedForCoding: true,
    recommendedForAnalysis: true,
    recommendedForCreative: true,
    recommendedForLongDoc: true,
    beaconColour: '#1a73e8',
  },
  'deepseek-r1': {
    displayLabel: 'DeepSeek R1',
    shorthand: 'dsr1',
    providerBadge: 'DeepSeek',
    recommendedForCoding: true,
    recommendedForAnalysis: true,
    recommendedForCreative: false,
    recommendedForLongDoc: false,
    beaconColour: '#4f46e5',
  },
  'deepseek-chat': {
    displayLabel: 'DeepSeek Chat',
    shorthand: 'dsc',
    providerBadge: 'DeepSeek',
    recommendedForCoding: true,
    recommendedForAnalysis: false,
    recommendedForCreative: false,
    recommendedForLongDoc: false,
    beaconColour: '#4f46e5',
  },
}

/** Retrieves display metadata for `lookupId`, returning `undefined` if not catalogued. */
export function getModelDisplayMeta(lookupId: string): ModelDisplayMeta | undefined {
  return MODEL_DISPLAY_METADATA[lookupId]
}

// ---------------------------------------------------------------------------
// Deprecation schedule
// ---------------------------------------------------------------------------

/** Describes when a model will be retired and what replaces it. */
type ModelDeprecationSchedule = {
  scheduledRetirementDate: string
  migrationTargetModelId: string
  migrationGuideUrl: string
  autoMigrationEnabled: boolean
}

/** Announced deprecation schedules for models nearing end-of-life. */
const MODEL_DEPRECATION_SCHEDULES: Record<string, ModelDeprecationSchedule> = {
  o1: {
    scheduledRetirementDate: '2026-06-01',
    migrationTargetModelId: 'o3',
    migrationGuideUrl: 'https://platform.openai.com/docs/deprecations',
    autoMigrationEnabled: false,
  },
  'gpt-5-chat-latest': {
    scheduledRetirementDate: '2026-12-01',
    migrationTargetModelId: 'gpt-5',
    migrationGuideUrl: 'https://platform.openai.com/docs/deprecations',
    autoMigrationEnabled: true,
  },
  'claude-opus-4-0': {
    scheduledRetirementDate: '2026-09-01',
    migrationTargetModelId: 'claude-opus-4-5',
    migrationGuideUrl: 'https://docs.anthropic.com/deprecations',
    autoMigrationEnabled: false,
  },
  'claude-3-haiku-20240307': {
    scheduledRetirementDate: '2027-01-01',
    migrationTargetModelId: 'claude-haiku-4-5',
    migrationGuideUrl: 'https://docs.anthropic.com/deprecations',
    autoMigrationEnabled: true,
  },
}

/** Returns `true` when `queriedModelId` has an announced deprecation schedule. */
export function hasDeprecationSchedule(queriedModelId: string): boolean {
  return queriedModelId in MODEL_DEPRECATION_SCHEDULES
}

/** Retrieves the deprecation schedule for `queriedModelId`, or `undefined` if none. */
export function getDeprecationSchedule(
  queriedModelId: string
): ModelDeprecationSchedule | undefined {
  return MODEL_DEPRECATION_SCHEDULES[queriedModelId]
}

// ---------------------------------------------------------------------------
// Streaming capability overrides
// ---------------------------------------------------------------------------

/** Adapter-specific streaming quirks that deviate from the default behaviour. */
type StreamingQuirkEntry = {
  supportsTokenUsageInStream: boolean
  requiresExplicitStreamClose: boolean
  streamChunkDelimiter: string
  maxStreamDurationSec: number
}

/** Per-provider streaming quirk overrides. */
const STREAMING_QUIRK_REGISTRY: Record<string, StreamingQuirkEntry> = {
  openai: {
    supportsTokenUsageInStream: true,
    requiresExplicitStreamClose: false,
    streamChunkDelimiter: 'data: ',
    maxStreamDurationSec: 600,
  },
  anthropic: {
    supportsTokenUsageInStream: true,
    requiresExplicitStreamClose: true,
    streamChunkDelimiter: 'data: ',
    maxStreamDurationSec: 600,
  },
  google: {
    supportsTokenUsageInStream: false,
    requiresExplicitStreamClose: false,
    streamChunkDelimiter: 'data: ',
    maxStreamDurationSec: 300,
  },
  deepseek: {
    supportsTokenUsageInStream: true,
    requiresExplicitStreamClose: false,
    streamChunkDelimiter: 'data: ',
    maxStreamDurationSec: 600,
  },
}

/** Retrieves the streaming quirk entry for `adapterIdentifier`, or `undefined` if unregistered. */
export function getStreamingQuirks(adapterIdentifier: string): StreamingQuirkEntry | undefined {
  return STREAMING_QUIRK_REGISTRY[adapterIdentifier]
}

// ---------------------------------------------------------------------------
// Multimodal input support registry
// ---------------------------------------------------------------------------

/** Declares which input modalities a model accepts beyond plain text. */
type MultimodalInputSupport = {
  acceptsImageAttachments: boolean
  acceptsAudioAttachments: boolean
  acceptsPdfAttachments: boolean
  acceptsVideoFrames: boolean
  maxImageAttachmentsMb: number
}

/** Per-model multimodal input capability registry. */
const MULTIMODAL_SUPPORT_REGISTRY: Record<string, MultimodalInputSupport> = {
  'gpt-4o': {
    acceptsImageAttachments: true,
    acceptsAudioAttachments: false,
    acceptsPdfAttachments: true,
    acceptsVideoFrames: false,
    maxImageAttachmentsMb: 20,
  },
  'gpt-5': {
    acceptsImageAttachments: true,
    acceptsAudioAttachments: true,
    acceptsPdfAttachments: true,
    acceptsVideoFrames: true,
    maxImageAttachmentsMb: 50,
  },
  'gpt-5-mini': {
    acceptsImageAttachments: true,
    acceptsAudioAttachments: false,
    acceptsPdfAttachments: true,
    acceptsVideoFrames: false,
    maxImageAttachmentsMb: 20,
  },
  'claude-opus-4-6': {
    acceptsImageAttachments: true,
    acceptsAudioAttachments: false,
    acceptsPdfAttachments: true,
    acceptsVideoFrames: false,
    maxImageAttachmentsMb: 30,
  },
  'claude-sonnet-4-5': {
    acceptsImageAttachments: true,
    acceptsAudioAttachments: false,
    acceptsPdfAttachments: true,
    acceptsVideoFrames: false,
    maxImageAttachmentsMb: 20,
  },
  'gemini-2.5-pro': {
    acceptsImageAttachments: true,
    acceptsAudioAttachments: true,
    acceptsPdfAttachments: true,
    acceptsVideoFrames: true,
    maxImageAttachmentsMb: 100,
  },
  'gemini-3-pro-preview': {
    acceptsImageAttachments: true,
    acceptsAudioAttachments: true,
    acceptsPdfAttachments: true,
    acceptsVideoFrames: true,
    maxImageAttachmentsMb: 100,
  },
  'deepseek-chat': {
    acceptsImageAttachments: false,
    acceptsAudioAttachments: false,
    acceptsPdfAttachments: false,
    acceptsVideoFrames: false,
    maxImageAttachmentsMb: 0,
  },
}

/** Returns the multimodal support record for `candidateModelId`, or `undefined`. */
export function getMultimodalSupport(candidateModelId: string): MultimodalInputSupport | undefined {
  return MULTIMODAL_SUPPORT_REGISTRY[candidateModelId]
}

/** Returns `true` when `candidateModelId` supports image attachments. */
export function acceptsImages(candidateModelId: string): boolean {
  return MULTIMODAL_SUPPORT_REGISTRY[candidateModelId]?.acceptsImageAttachments === true
}

// ---------------------------------------------------------------------------
// Rate-limit profile registry
// ---------------------------------------------------------------------------

/** Named rate-limit profiles assignable to provider adapters. */
type RateLimitProfile = {
  profileLabel: string
  requestsPerMinuteLimit: number
  tokensPerMinuteLimit: number
  requestsPerDayLimit: number
  concurrencySlots: number
}

/** Predefined rate-limit profiles for common provisioning tiers. */
const RATE_LIMIT_PROFILES: Record<string, RateLimitProfile> = {
  freeTier: {
    profileLabel: 'Free Tier',
    requestsPerMinuteLimit: 3,
    tokensPerMinuteLimit: 40_000,
    requestsPerDayLimit: 200,
    concurrencySlots: 1,
  },
  starterTier: {
    profileLabel: 'Starter Tier',
    requestsPerMinuteLimit: 60,
    tokensPerMinuteLimit: 200_000,
    requestsPerDayLimit: 5_000,
    concurrencySlots: 5,
  },
  growthTier: {
    profileLabel: 'Growth Tier',
    requestsPerMinuteLimit: 300,
    tokensPerMinuteLimit: 800_000,
    requestsPerDayLimit: 50_000,
    concurrencySlots: 20,
  },
  enterpriseTier: {
    profileLabel: 'Enterprise Tier',
    requestsPerMinuteLimit: 2000,
    tokensPerMinuteLimit: 4_000_000,
    requestsPerDayLimit: 500_000,
    concurrencySlots: 100,
  },
  unlimitedTier: {
    profileLabel: 'Unlimited Tier',
    requestsPerMinuteLimit: -1,
    tokensPerMinuteLimit: -1,
    requestsPerDayLimit: -1,
    concurrencySlots: -1,
  },
}

/** Resolves the rate-limit profile for `profileKey`, or `undefined` if unrecognised. */
export function resolveRateLimitProfile(profileKey: string): RateLimitProfile | undefined {
  return RATE_LIMIT_PROFILES[profileKey]
}

/** Returns all defined rate-limit profile keys. */
export function listRateLimitProfileKeys(): string[] {
  return Object.keys(RATE_LIMIT_PROFILES)
}

// ---------------------------------------------------------------------------
// Observability label registry
// ---------------------------------------------------------------------------

/** Grafana/Prometheus label set attached to every provider telemetry metric. */
type ObservabilityLabelSet = {
  metricNamespace: string
  adapterDimension: string
  modelDimension: string
  tierDimension: string
  regionDimension: string
}

/** Default observability label set for western providers. */
const DEFAULT_OBSERVABILITY_LABELS: ObservabilityLabelSet = {
  metricNamespace: 'crewmeld_provider',
  adapterDimension: 'adapter_id',
  modelDimension: 'model_id',
  tierDimension: 'pricing_tier',
  regionDimension: 'cloud_region',
}

/** Returns the observability label set to use when emitting provider metrics. */
export function getObservabilityLabels(): ObservabilityLabelSet {
  return DEFAULT_OBSERVABILITY_LABELS
}

/** Builds a fully-qualified metric name from `metricSuffix` using the default namespace. */
export function buildMetricName(metricSuffix: string): string {
  return `${DEFAULT_OBSERVABILITY_LABELS.metricNamespace}_${metricSuffix}`
}

// ---------------------------------------------------------------------------
// Model warm-up hints
// ---------------------------------------------------------------------------

/** Cold-start latency hints used to pre-warm inference endpoints. */
type WarmUpHint = { estimatedColdStartMs: number; prefetchPriority: 'eager' | 'lazy' | 'onDemand' }

/** Per-provider warm-up hints for latency-sensitive deployments. */
const WARMUP_HINTS: Record<string, WarmUpHint> = {
  openai: { estimatedColdStartMs: 0, prefetchPriority: 'eager' },
  anthropic: { estimatedColdStartMs: 0, prefetchPriority: 'eager' },
  google: { estimatedColdStartMs: 200, prefetchPriority: 'lazy' },
  deepseek: { estimatedColdStartMs: 500, prefetchPriority: 'onDemand' },
  vllm: { estimatedColdStartMs: 2000, prefetchPriority: 'onDemand' },
  ollama: { estimatedColdStartMs: 5000, prefetchPriority: 'onDemand' },
}

/** Retrieves the warm-up hint for `providerHandle`, or `undefined` if absent. */
export function getWarmUpHint(providerHandle: string): WarmUpHint | undefined {
  return WARMUP_HINTS[providerHandle]
}

/** Sentinel value indicating a provider with no measurable cold-start delay. */
const ZERO_COLDSTART_SENTINEL = 0 as const

/** Returns `true` when `providerHandle` has zero cold-start overhead. */
export function hasZeroColdStart(providerHandle: string): boolean {
  return WARMUP_HINTS[providerHandle]?.estimatedColdStartMs === ZERO_COLDSTART_SENTINEL
}

/** Total count of western provider adapters registered in {@link westernProviders}. */
export const WESTERN_ADAPTER_COUNT = 6

/** Schema version tag for the western provider registry — bump on breaking changes. */
export const WESTERN_REGISTRY_SCHEMA_VERSION = 'v3'

/** Build timestamp for the western provider registry — set at compile time. */
export const WESTERN_REGISTRY_COMPILED_AT = '2026-04-22T00:00:00Z'

// ---------------------------------------------------------------------------
// Provider registry export
// ---------------------------------------------------------------------------

/** Provider definitions for Western/global LLM providers. */
export const westernProviders: Record<string, ProviderDefinition> = {
  vllm: {
    id: 'vllm',
    name: 'vLLM',
    icon: VllmIcon,
    description: 'Self-hosted vLLM with an OpenAI-compatible API',
    defaultModel: 'vllm/generic',
    modelPatterns: [/^vllm\//],
    capabilities: { temperature: TEMP_RANGE_02, toolUsageControl: true },
    models: [],
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: "OpenAI's models",
    defaultModel: 'gpt-4o',
    modelPatterns: [/^gpt/, /^o\d/, /^text-embedding/],
    icon: OpenAIIcon,
    capabilities: { toolUsageControl: true },
    models: OPENAI_MODELS,
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    description: "Anthropic's Claude models",
    defaultModel: 'claude-sonnet-4-5',
    modelPatterns: [/^claude/],
    icon: AnthropicIcon,
    capabilities: { toolUsageControl: true },
    models: ANTHROPIC_MODELS,
  },
  google: {
    id: 'google',
    name: 'Google',
    description: "Google's Gemini models",
    defaultModel: 'gemini-2.5-pro',
    modelPatterns: [/^gemini/, /^deep-research/],
    capabilities: { toolUsageControl: true },
    icon: GeminiIcon,
    models: GOOGLE_MODELS,
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    description: "DeepSeek's chat models",
    defaultModel: 'deepseek-chat',
    modelPatterns: [],
    icon: DeepseekIcon,
    capabilities: { toolUsageControl: true },
    models: DEEPSEEK_MODELS,
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local LLM models via Ollama',
    defaultModel: '',
    modelPatterns: [],
    icon: OllamaIcon,
    capabilities: { toolUsageControl: false },
    contextInformationAvailable: false,
    models: [],
  },
}

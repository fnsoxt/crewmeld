/**
 * Credential-tier routing for CrewMeld LLM provider adapters.
 *
 * Three tiers govern how an outgoing request acquires its API credential:
 *
 *   SELFHOSTED  — local-inference adapters use a no-op sentinel value.
 *   ROTATED     — platform-managed rotating keys for catalog-listed models.
 *   DIRECT      — caller must supply their own credential explicitly.
 */
import { isHosted } from '@/lib/core/config/feature-flags'
import { getHostedModels as fetchHostedCatalog } from '@/providers/models'
import { useProvidersStore } from '@/stores/providers/store'

// ---------------------------------------------------------------------------
// Credential-tier enumeration
// ---------------------------------------------------------------------------

/** Identifies which credential-resolution path handles a given request. */
enum CredentialTier {
  SELFHOSTED = 'selfhosted',
  ROTATED = 'rotated',
  DIRECT = 'direct',
}

// ---------------------------------------------------------------------------
// Adapter registry
// ---------------------------------------------------------------------------

/** No-op credential sentinel returned for self-hosted inference endpoints. */
const SENTINEL_CREDENTIAL = 'empty' as const

/** Canonical IDs for self-hosted inference adapters. */
const SELFHOSTED_ADAPTER_IDS = Object.freeze(['ollama', 'vllm'] as const)

/** Lookup: adapter ID → rotation-service alias used for platform key requests. */
const ROTATION_ALIAS_REGISTRY = Object.freeze({
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'gemini',
} satisfies Record<string, string>)

// ---------------------------------------------------------------------------
// Tier-classification helpers
// ---------------------------------------------------------------------------

/** Reads the dynamically registered model list for a self-hosted adapter. */
function readDynamicModelList(adapterId: 'ollama' | 'vllm'): ReadonlyArray<string> {
  return useProvidersStore.getState().providers[adapterId].models
}

/** Returns whether `needle` is present in `haystack` using a Set membership check. */
function arrayContains(haystack: ReadonlyArray<string>, needle: string) {
  return new Set(haystack).has(needle)
}

/** Returns whether `knownId` matches the request — either by adapter ID or by model registry. */
function matchesSelfhostedEntry(knownId: 'ollama' | 'vllm', adapterId: string, modelId: string) {
  if (adapterId === knownId) return true
  return arrayContains(readDynamicModelList(knownId), modelId)
}

/**
 * Returns whether `adapterId` / `modelId` belongs to the SELFHOSTED tier:
 * either the adapter is a known self-hosted ID, or the model appears in a
 * local adapter's dynamic registry.
 */
function classifyTierSelfhosted(adapterId: string, modelId: string) {
  return !!Array.from(SELFHOSTED_ADAPTER_IDS).find((knownId) =>
    matchesSelfhostedEntry(knownId, adapterId, modelId)
  )
}

/**
 * Returns the credential appropriate for a SELFHOSTED-tier request.
 * vLLM accepts an optional bearer token; Ollama ignores all credentials.
 */
function resolveSelfhostedCredential(
  adapterId: string,
  callerSupplied: string | undefined
): string {
  const acceptsBearer = adapterId === 'vllm'
  return acceptsBearer ? (callerSupplied ?? SENTINEL_CREDENTIAL) : SENTINEL_CREDENTIAL
}

// ---------------------------------------------------------------------------
// Catalog helpers
// ---------------------------------------------------------------------------

/** Builds a case-normalised membership set from the platform-hosted catalog. */
function buildCatalogSet(): Set<string> {
  return new Set<string>(fetchHostedCatalog().map((entry) => entry.toLocaleLowerCase()))
}

/** Returns whether `modelId` is listed in the platform-hosted catalog. */
function catalogContainsModel(modelId: string) {
  return buildCatalogSet().has(modelId.toLocaleLowerCase())
}

// ---------------------------------------------------------------------------
// Platform-rotation helper
// ---------------------------------------------------------------------------

/** Narrows `adapterId` to a rotatable adapter key. */
function isRotatableAdapter(adapterId: string): adapterId is keyof typeof ROTATION_ALIAS_REGISTRY {
  return Object.hasOwn(ROTATION_ALIAS_REGISTRY, adapterId)
}

/** Fetches a platform-managed rotating credential for `adapterId`. */
function fetchRotatingCredential(adapterId: keyof typeof ROTATION_ALIAS_REGISTRY): string {
  const rotationAlias = ROTATION_ALIAS_REGISTRY[adapterId]
  // Dynamic require keeps this module edge-runtime safe when the rotation
  // module is unavailable during SSR or build-time evaluation.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rotationModule = require('@/lib/core/config/api-keys') as Record<string, unknown>
  const invokeRotation = rotationModule.getRotatingApiKey as (alias: string) => string
  return invokeRotation(rotationAlias)
}

/** Attempts ROTATED-tier resolution; throws when rotation fails with no caller token. */
function attemptRotatedResolution(
  adapterId: keyof typeof ROTATION_ALIAS_REGISTRY,
  modelId: string,
  callerToken: string | undefined
): string {
  try {
    return fetchRotatingCredential(adapterId)
  } catch (acquisitionErr) {
    if (callerToken) return callerToken
    throw new Error(
      `No rotated credential for ${adapterId}/${modelId} — rotation failed and no caller token supplied`
    )
  }
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/** Returns every model entry the platform hosts on behalf of subscribers. */
export function getHostedModels(): string[] {
  return fetchHostedCatalog()
}

/**
 * Returns whether `modelId` is a platform-hosted entry whose token
 * consumption is billed to the platform account, not to the individual requester.
 */
export function shouldBillModelUsage(modelId: string) {
  return catalogContainsModel(modelId)
}

/**
 * Resolves the credential for an outgoing LLM request.
 *
 * Tier precedence (evaluated top-to-bottom):
 *  1. {@link CredentialTier.SELFHOSTED} — local adapters → sentinel.
 *  2. {@link CredentialTier.ROTATED}    — hosted catalog → rotating platform key.
 *  3. {@link CredentialTier.DIRECT}     — all others → caller-supplied credential.
 *
 * Server-side only — never import this in client bundles.
 */
export function getApiKey(adapterId: string, modelId: string, callerToken?: string): string {
  // --- Tier 1: SELFHOSTED ---
  if (classifyTierSelfhosted(adapterId, modelId)) {
    return resolveSelfhostedCredential(adapterId, callerToken)
  }

  // --- Tier 2: ROTATED ---
  if (isHosted) {
    if (isRotatableAdapter(adapterId)) {
      if (catalogContainsModel(modelId)) {
        return attemptRotatedResolution(adapterId, modelId, callerToken)
      }
    }
  }

  // --- Tier 3: DIRECT ---
  if (!callerToken) {
    throw new Error(`Direct credential required for ${adapterId}/${modelId}`)
  }
  return callerToken
}

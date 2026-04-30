/**
 * Tool execution helpers — usage-control filtering, forced-tool sequencing,
 * and parameter preparation for provider round-trips.
 */
import { createLogger } from '@crewmeld/logger'
import { mergeToolParameters } from '@/lib/tools/merge-params'

// ---------------------------------------------------------------------------
// Internal type aliases
// ---------------------------------------------------------------------------

/** Object-form tool-choice descriptors used across providers. */
type ToolChoiceObj =
  | { type: 'function'; function: { name: string } }
  | { type: 'tool'; name: string }
  | { type: 'any'; any: { model: string; name: string } }

/** Google-specific function-calling configuration wrapper. */
type CallingConfig = {
  functionCallingConfig: {
    mode: 'AUTO' | 'ANY' | 'NONE'
    allowedFunctionNames?: string[]
  }
}

/** Result shape returned by internal builder helpers. */
type ChoiceBundle = { selection: ToolChoiceObj | 'auto'; callingCfg?: CallingConfig }

// ---------------------------------------------------------------------------
// Tool filtering helpers
// ---------------------------------------------------------------------------

/** Returns `true` when the given raw tool descriptor is not suppressed by usage-control. */
function isToolPermitted(rawTool: any, configuredTools: any[] | undefined): boolean {
  const resolvedId: string = rawTool.function?.name || rawTool.name
  const matching = configuredTools?.find((cfg) => cfg.id === resolvedId)
  return matching?.usageControl !== 'none'
}

/** Collects IDs of every tool configured with the `force` usage-control setting. */
function collectForcedIds(configuredTools: any[]): string[] {
  return configuredTools
    .filter((cfg) => cfg.usageControl === 'force')
    .map((cfg) => cfg.id as string)
}

// ---------------------------------------------------------------------------
// Tool-choice builders
// ---------------------------------------------------------------------------

/** Builds the provider-appropriate forced-tool-choice descriptor for a single `toolId`. */
function buildForcedChoice(toolId: string, adapterKind: string | undefined): ChoiceBundle {
  if (adapterKind === 'anthropic') {
    return { selection: { type: 'tool', name: toolId } }
  }
  if (adapterKind === 'google') {
    return {
      selection: 'auto',
      callingCfg: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [toolId] } },
    }
  }
  return { selection: { type: 'function', function: { name: toolId } } }
}

/** Builds the provider-appropriate forced-tool-choice descriptor for multiple `toolIds`. */
function buildMultiForcedChoice(toolIds: string[], adapterKind: string | undefined): ChoiceBundle {
  if (adapterKind === 'google') {
    return {
      selection: 'auto',
      callingCfg: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: toolIds } },
    }
  }
  return buildForcedChoice(toolIds[0], adapterKind)
}

// ---------------------------------------------------------------------------
// Public API: prepareToolsWithUsageControl
// ---------------------------------------------------------------------------

/**
 * Filters and configures tools for a provider request, applying per-tool
 * usage-control settings and constructing the appropriate tool_choice value.
 */
export function prepareToolsWithUsageControl(
  tools: any[] | undefined,
  providerTools: any[] | undefined,
  logger: any,
  provider?: string
): {
  tools: any[] | undefined
  toolChoice: 'auto' | 'none' | ToolChoiceObj | undefined
  toolConfig?: CallingConfig
  hasFilteredTools: boolean
  forcedTools: string[]
} {
  if (!tools || tools.length === 0) {
    return { tools: undefined, toolChoice: undefined, hasFilteredTools: false, forcedTools: [] }
  }

  const permittedSet = tools.filter((raw) => isToolPermitted(raw, providerTools))
  const didFilter = permittedSet.length < tools.length

  if (didFilter) {
    logger.info(`Suppressed ${tools.length - permittedSet.length} tool(s) via usageControl='none'`)
  }

  if (permittedSet.length === 0) {
    logger.info('All tools suppressed by usageControl — disabling tool-use for this turn')
    return { tools: undefined, toolChoice: undefined, hasFilteredTools: true, forcedTools: [] }
  }

  const pinnedIds = collectForcedIds(providerTools ?? [])

  let activeSelection: ToolChoiceObj | 'auto' = 'auto'
  let activeCallingCfg: CallingConfig | undefined

  if (pinnedIds.length > 0) {
    const primaryId = pinnedIds[0]
    const built =
      pinnedIds.length === 1
        ? buildForcedChoice(primaryId, provider)
        : buildMultiForcedChoice(pinnedIds, provider)

    activeSelection = built.selection
    activeCallingCfg = built.callingCfg

    logger.info(`Pinning tool-use to: ${primaryId}`)
    if (pinnedIds.length > 1) {
      logger.info(`Multiple pinned tools detected (${pinnedIds.join(', ')}); cycling sequentially.`)
    }
  } else {
    activeSelection = 'auto'
    if (provider === 'google') {
      activeCallingCfg = { functionCallingConfig: { mode: 'AUTO' } }
    }
    logger.info('Tool selection delegated to model (auto mode)')
  }

  return {
    tools: permittedSet,
    toolChoice: activeSelection,
    toolConfig: activeCallingCfg,
    hasFilteredTools: didFilter,
    forcedTools: pinnedIds,
  }
}

// ---------------------------------------------------------------------------
// Forced-tool usage tracker helpers
// ---------------------------------------------------------------------------

/** Extracts mandated tool-call names from a Google-format originalToolChoice config. */
function extractGoogleForcedNames(originalChoice: any): string[] {
  return (originalChoice?.functionCallingConfig?.allowedFunctionNames as string[]) ?? []
}

/** Extracts mandated tool-call names from an OpenAI/Anthropic-format originalToolChoice. */
function extractObjectForcedNames(originalChoice: any): string[] {
  const direct: string | undefined =
    originalChoice?.function?.name ||
    (originalChoice?.type === 'tool' ? (originalChoice?.name as string) : undefined) ||
    (originalChoice?.type === 'any' ? (originalChoice?.any?.name as string) : undefined)
  return direct ? [direct] : []
}

/** Resolves the set of tool IDs mandated by `originalChoice`. */
function resolveMandatedNames(originalChoice: any, adapterKind: string | undefined): string[] {
  if (adapterKind === 'google') return extractGoogleForcedNames(originalChoice)
  if (typeof originalChoice === 'object' && originalChoice !== null) {
    return extractObjectForcedNames(originalChoice)
  }
  return []
}

/** Result shape returned by `advanceToolChoice`. */
type AdvanceResult = { selection: ToolChoiceObj | 'auto' | null; callingCfg?: CallingConfig }

/** Builds the next tool-choice after consuming one or more forced tools. */
function advanceToolChoice(remaining: string[], adapterKind: string | undefined): AdvanceResult {
  if (remaining.length === 0) {
    if (adapterKind === 'anthropic') return { selection: null }
    if (adapterKind === 'google') {
      return { selection: 'auto', callingCfg: { functionCallingConfig: { mode: 'AUTO' } } }
    }
    return { selection: 'auto' }
  }
  const bundle =
    remaining.length === 1
      ? buildForcedChoice(remaining[0], adapterKind)
      : buildMultiForcedChoice(remaining, adapterKind)
  return bundle
}

// ---------------------------------------------------------------------------
// Public API: trackForcedToolUsage
// ---------------------------------------------------------------------------

/**
 * Checks whether a forced tool was used in the latest response and returns
 * the next tool_choice to apply in the following iteration.
 */
export function trackForcedToolUsage(
  toolCallsResponse: any[] | undefined,
  originalToolChoice: any,
  logger: any,
  provider?: string,
  forcedTools: string[] = [],
  usedForcedTools: string[] = []
): {
  hasUsedForcedTool: boolean
  usedForcedTools: string[]
  nextToolChoice?: ToolChoiceObj | 'auto' | null
  nextToolConfig?: CallingConfig
} {
  const isGoogle = provider === 'google'
  const mandated = resolveMandatedNames(originalToolChoice, provider)

  if (mandated.length === 0 || !toolCallsResponse || toolCallsResponse.length === 0) {
    return {
      hasUsedForcedTool: false,
      usedForcedTools,
      nextToolChoice: originalToolChoice as ToolChoiceObj | 'auto',
      nextToolConfig: isGoogle ? (originalToolChoice as CallingConfig) : undefined,
    }
  }

  const invokedNames = toolCallsResponse.map(
    (tc) => (tc.function?.name || tc.name || tc.id) as string
  )
  const consumed = mandated.filter((tid) => invokedNames.includes(tid))

  if (consumed.length === 0) {
    return {
      hasUsedForcedTool: false,
      usedForcedTools,
      nextToolChoice: originalToolChoice as ToolChoiceObj | 'auto',
      nextToolConfig: isGoogle ? (originalToolChoice as CallingConfig) : undefined,
    }
  }

  const tallied = [...usedForcedTools, ...consumed]
  const outstanding = forcedTools.filter((tid) => !tallied.includes(tid))
  const { selection: advancedChoice, callingCfg: advancedCfg } = advanceToolChoice(
    outstanding,
    provider
  )

  if (outstanding.length > 0) {
    logger.info(
      `Consumed forced tool(s) [${consumed.join(', ')}]; advancing to: [${outstanding.join(', ')}]`
    )
  } else {
    logger.info('All pinned tools consumed — reverting to auto selection')
  }

  return {
    hasUsedForcedTool: true,
    usedForcedTools: tallied,
    nextToolChoice: advancedChoice,
    nextToolConfig: isGoogle ? advancedCfg : undefined,
  }
}

// ---------------------------------------------------------------------------
// Execution parameter builder helpers
// ---------------------------------------------------------------------------

/** Assembles the context block attached to every tool invocation. */
function buildContextBlock(req: {
  workflowId?: string
  workspaceId?: string
  chatId?: string
  userId?: string
  isDeployedContext?: boolean
}): Record<string, unknown> {
  const ctx: Record<string, unknown> = { workflowId: req.workflowId }
  if (req.workspaceId !== undefined) ctx.workspaceId = req.workspaceId
  if (req.chatId !== undefined) ctx.chatId = req.chatId
  if (req.userId !== undefined) ctx.userId = req.userId
  if (req.isDeployedContext !== undefined) ctx.isDeployedContext = req.isDeployedContext
  return ctx
}

// ---------------------------------------------------------------------------
// Public API: prepareToolExecution
// ---------------------------------------------------------------------------

/**
 * Merges LLM-supplied arguments with block params and attaches execution context
 * (workflowId, envVars, etc.) needed by tool handlers.
 */
export function prepareToolExecution(
  tool: {
    params?: Record<string, any>
    parameters?: Record<string, any>
    paramsTransform?: (params: Record<string, any>) => Record<string, any>
  },
  llmArgs: Record<string, any>,
  request: {
    workflowId?: string
    workspaceId?: string
    chatId?: string
    userId?: string
    environmentVariables?: Record<string, any>
    workflowVariables?: Record<string, any>
    blockData?: Record<string, any>
    blockNameMapping?: Record<string, string>
    isDeployedContext?: boolean
  }
): { toolParams: Record<string, any>; executionParams: Record<string, any> } {
  const execLogger = createLogger('ProviderExecution')
  let merged = mergeToolParameters(tool.params || {}, llmArgs) as Record<string, any>

  if (tool.paramsTransform) {
    try {
      merged = tool.paramsTransform(merged)
    } catch (err) {
      execLogger.warn('paramsTransform failed, using raw params', { error: err })
    }
  }

  const runParams: Record<string, any> = { ...merged }

  if (request.workflowId) {
    runParams._context = buildContextBlock(request)
  }
  if (request.environmentVariables) runParams.envVars = request.environmentVariables
  if (request.workflowVariables) runParams.workflowVariables = request.workflowVariables
  if (request.blockData) runParams.blockData = request.blockData
  if (request.blockNameMapping) runParams.blockNameMapping = request.blockNameMapping
  if (tool.parameters) runParams._toolSchema = tool.parameters

  return { toolParams: merged, executionParams: runParams }
}

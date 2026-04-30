/**
 * Build OpenAI tool definitions from DB tool_instances table — for SOP node LLM multi-tool execution
 *
 * toolIds now store instance IDs (not template IDs).
 * Query endpoints from tool_instances table, get parameter schemas from tools table.
 */

import { db, toolInstances, tools as toolsTable } from '@crewmeld/db'
import { createLogger } from '@crewmeld/logger'
import { inArray } from 'drizzle-orm'
import type { OpenAITool } from '@/lib/conversation/types'
import { t } from '@/lib/core/server-i18n'

const logger = createLogger('SopToolBuilder')

/** Compose tool description: base description + API doc (for LLM to understand parameter format) */
function buildToolDescription(
  description: string | undefined | null,
  apiDoc: string | undefined | null,
  fallbackName: string
): string {
  const base = description || t('sopCallTool', undefined, { name: fallbackName })
  if (!apiDoc) return base
  return `${base}\n\n${apiDoc}`
}

interface ToolParameters {
  type: string
  properties: Record<string, { type: string; description: string }>
  required?: string[]
}

export interface ToolEndpointInfo {
  toolId: string
  endpoint: string
  instanceName: string
}

export interface BuildToolResult {
  tools: OpenAITool[]
  endpointMap: Map<string, ToolEndpointInfo>
}

/**
 * Build OpenAI tool definitions and endpoint mapping from instance ID list
 *
 * Only includes instances with deploy.status === 'deployed'
 */
export async function buildToolDefinitionsFromIds(instanceIds: string[]): Promise<BuildToolResult> {
  const tools: OpenAITool[] = []
  const endpointMap = new Map<string, ToolEndpointInfo>()

  if (instanceIds.length === 0) {
    return { tools, endpointMap }
  }

  // Query instance info
  const instanceRows = await db
    .select({
      id: toolInstances.id,
      templateId: toolInstances.templateId,
      name: toolInstances.name,
      deploy: toolInstances.deploy,
    })
    .from(toolInstances)
    .where(inArray(toolInstances.id, instanceIds))

  // Batch query parameter schemas for all related templates
  const templateIds = [...new Set(instanceRows.map((r) => r.templateId))]
  const templateRows =
    templateIds.length > 0
      ? await db
          .select({
            id: toolsTable.id,
            name: toolsTable.name,
            description: toolsTable.description,
            parameters: toolsTable.parameters,
            apiDoc: toolsTable.apiDoc,
          })
          .from(toolsTable)
          .where(inArray(toolsTable.id, templateIds))
      : []

  const templateMap = new Map(templateRows.map((r) => [r.id, r]))

  for (const row of instanceRows) {
    const deploy = row.deploy as { status?: string; endpoint?: string } | null
    if (deploy?.status !== 'deployed' || !deploy.endpoint) {
      logger.warn(`Instance ${row.id} (${row.name}) not deployed or missing endpoint, skipping`)
      continue
    }

    const template = templateMap.get(row.templateId)
    const toolName = `skill_${row.id}`
    endpointMap.set(toolName, { toolId: row.id, endpoint: deploy.endpoint, instanceName: row.name })

    const skillParams = template?.parameters as ToolParameters | null

    const parameters: Record<string, unknown> = skillParams
      ? {
          type: skillParams.type || 'object',
          properties: skillParams.properties ?? {},
          ...(skillParams.required ? { required: skillParams.required } : {}),
        }
      : {
          type: 'object',
          description: t('sopToolInput'),
          additionalProperties: true,
        }

    tools.push({
      type: 'function',
      function: {
        name: toolName,
        description: buildToolDescription(template?.description, template?.apiDoc, row.name),
        parameters: parameters as OpenAITool['function']['parameters'],
      },
    })
  }

  logger.info(`Built ${tools.length} tool definitions from ${instanceIds.length} instance IDs`)
  return { tools, endpointMap }
}

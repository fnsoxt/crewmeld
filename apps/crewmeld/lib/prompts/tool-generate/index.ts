/**
 * Tool-generate system prompt builder.
 *
 * All natural-language text comes from the locale system (`messages[locale].prompts.toolGenerate`).
 * This module only contains the assembly logic.
 */

import type { Locale } from '@/locales'
import { messages } from '@/locales'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToolGenerateRole = 'generate' | 'refine' | 'fix'

export interface ToolGenerateSpecs {
  codeSpec: string
  securitySpec: string
  inputReqSpec: string
}

export interface ToolLike {
  title: string
  description: string
  parameters: unknown
  code: string
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export async function getToolGenerateSystemPrompt(
  locale: Locale,
  role: ToolGenerateRole,
  specs: ToolGenerateSpecs
): Promise<string> {
  const t = messages[locale].prompts.toolGenerate

  const roleIntro = { generate: t.roleGenerate, refine: t.roleRefine, fix: t.roleFix }[role]
  const outputNote = role === 'generate' ? '' : `\n${t.outputNote}`

  const sections = [
    `## ${t.inputReqSpecTitle}`,
    specs.inputReqSpec || t.inputReqSpecDefault,
    '',
    `## ${t.codeSpecTitle}`,
    specs.codeSpec || t.codeSpecDefault,
    '',
    `## ${t.securitySpecTitle}`,
    specs.securitySpec || t.securitySpecDefault,
    '',
    t.envSpec,
    '',
    t.runtimeSpec,
    '',
    t.depsSpec,
    '',
    t.extraNotes,
  ]

  return [roleIntro, '', ...sections, outputNote].join('\n')
}

// ---------------------------------------------------------------------------
// User message formatters
// ---------------------------------------------------------------------------

export function formatFixUserMessage(locale: Locale, tool: ToolLike, errorMsg: string): string {
  const t = messages[locale].prompts.toolGenerate
  return [
    `## ${t.fixCurrentToolTitle}`,
    `${t.fixNameLabel}: ${tool.title}`,
    `${t.fixDescLabel}: ${tool.description}`,
    `${t.fixParamSchemaLabel}:\n${JSON.stringify(tool.parameters, null, 2)}`,
    `${t.fixCodeLabel}:\n${tool.code}`,
    '',
    `## ${t.fixErrorTitle}`,
    errorMsg,
    '',
    t.fixInstruction,
  ].join('\n')
}

export function formatRefineUserMessage(
  locale: Locale,
  tool: ToolLike,
  instruction: string
): string {
  const t = messages[locale].prompts.toolGenerate
  return [
    `## ${t.fixCurrentToolTitle}`,
    `${t.fixNameLabel}: ${tool.title}`,
    `${t.fixDescLabel}: ${tool.description}`,
    `${t.fixParamSchemaLabel}:\n${JSON.stringify(tool.parameters, null, 2)}`,
    `${t.fixCodeLabel}:\n${tool.code}`,
    '',
    `## ${t.refineRequestTitle}`,
    instruction.trim(),
    '',
    t.refineInstruction,
  ].join('\n')
}

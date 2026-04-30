/**
 * Code-execution language enum stub — P0 does not ship the sandbox.
 *
 * TODO: P1 port real implementation from upstream engine (lib/execution/languages.ts).
 */

export enum CodeLanguage {
  JavaScript = 'javascript',
  TypeScript = 'typescript',
  Python = 'python',
}

export const DEFAULT_CODE_LANGUAGE = CodeLanguage.JavaScript

export function isValidCodeLanguage(value: string): value is CodeLanguage {
  return (Object.values(CodeLanguage) as string[]).includes(value)
}

export function getLanguageDisplayName(language: CodeLanguage): string {
  switch (language) {
    case CodeLanguage.JavaScript:
      return 'JavaScript'
    case CodeLanguage.TypeScript:
      return 'TypeScript'
    case CodeLanguage.Python:
      return 'Python'
    default:
      return String(language)
  }
}

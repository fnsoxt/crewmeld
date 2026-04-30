/**
 * Environment variable API stub — P0 does not ship the personal/workspace
 * env-var settings store. Returns empty maps so the settings panel loads.
 *
 * TODO: P1 port real implementation from upstream engine (lib/environment/api.ts).
 */

export interface EnvironmentVariable {
  key: string
  value: string
}

export interface WorkspaceEnvironmentData {
  workspace: Record<string, EnvironmentVariable>
  personal: Record<string, EnvironmentVariable>
  conflicts: string[]
}

export async function fetchPersonalEnvironment(): Promise<Record<string, EnvironmentVariable>> {
  return {}
}

export async function fetchWorkspaceEnvironment(
  _workspaceId: string
): Promise<WorkspaceEnvironmentData> {
  return { workspace: {}, personal: {}, conflicts: [] }
}

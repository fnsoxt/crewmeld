import type { LicenseStatus } from '@/lib/license/types'

export type { LicenseStatus } from '@/lib/license/types'

/** Version info */
export interface VersionInfo {
  appVersion: string
  buildDate: string | null
  gitCommit: string | null
  nodeVersion: string
  dbVersion: string | null
}

/** Individual service health status */
export interface ServiceHealth {
  name: string
  status: 'healthy' | 'unhealthy' | 'timeout' | 'not_configured'
  version: string | null
  latencyMs: number | null
  message: string | null
}

/** Health check result */
export interface HealthCheckResult {
  services: ServiceHealth[]
  checkedAt: string
}

/** Resource usage stats */
export interface ResourceUsage {
  usedMb: number
  totalMb: number
  usagePercent: number
}

/** Disk usage stats */
export interface DiskUsage {
  usedGb: number
  totalGb: number
  usagePercent: number
}

/** System runtime stats */
export interface SystemStats {
  totalUsers: number
  totalEmployees: number
  totalTasksExecuted: number
  uptimeSeconds: number
  memoryUsage: ResourceUsage
  diskUsage: DiskUsage
}

/** K8s deployment info (only in Helm deployments) */
export interface DeploymentInfo {
  mode: 'k8s'
  namespace: string | null
  podName: string | null
  nodeName: string | null
  helmRelease: string | null
  chartVersion: string | null
}

/** System info API response */
export interface SystemInfoResponse {
  version: VersionInfo
  license: LicenseStatus
  healthCheck: HealthCheckResult
  stats: SystemStats
  deploymentInfo: DeploymentInfo | null
}

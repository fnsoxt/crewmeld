/** Audit log list item (API response) */
export interface AuditLogItem {
  id: string
  action: string
  resourceType: string
  resourceId: string | null
  resourceName: string | null
  actorId: string | null
  actorName: string | null
  actorEmail: string | null
  description: string | null
  ipAddress: string | null
  userAgent: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

/** Audit log list response */
export interface AuditLogListResponse {
  success: true
  data: AuditLogItem[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

/** Anomaly alert list item (API response) */
export interface AnomalyAlertItem {
  id: string
  severity: 'critical' | 'warning' | 'info'
  status: 'open' | 'acknowledged' | 'resolved'
  category: 'task_failure' | 'employee_error' | 'system_error' | 'performance' | 'security'
  title: string
  description: string | null
  employeeId: string | null
  employeeName: string | null
  taskExecutionId: string | null
  errorMessage: string | null
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
  metadata?: Record<string, unknown>
}

/** Anomaly alert list response */
export interface AnomalyAlertListResponse {
  success: true
  data: AnomalyAlertItem[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

/** Alert status update request */
export interface UpdateAlertStatusInput {
  status: 'acknowledged' | 'resolved'
}

/** Compliance export preview response */
export interface AuditExportPreview {
  success: true
  data: {
    totalRecords: number
    dateRange: { start: string; end: string }
    breakdown: {
      category: string
      count: number
    }[]
  }
}

/** Audit log query filter parameters */
export interface AuditLogQueryParams {
  action?: string
  resourceType?: string
  actorId?: string
  startDate?: string
  endDate?: string
  keyword?: string
  limit?: number
  offset?: number
}

/** Anomaly alert query filter parameters */
export interface AlertQueryParams {
  severity?: 'critical' | 'warning' | 'info'
  status?: 'open' | 'acknowledged' | 'resolved'
  category?: string
  employeeId?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

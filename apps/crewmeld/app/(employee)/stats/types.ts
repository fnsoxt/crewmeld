/** Date range preset options */
export type DateRangePreset = '7d' | '30d' | '90d' | 'custom'

/** Date range */
export interface DateRange {
  preset: DateRangePreset
  from: string
  to: string
}

/** Stats tab */
export type StatsTab = 'overview' | 'cost'

/** Overview sub-tab */
export type OverviewSubTab =
  | 'summary'
  | 'task-trend'
  | 'success-trend'
  | 'exception'
  | 'employee-comparison'

/** Overview metrics */
export interface OverviewMetrics {
  totalTasks: number
  successRate: number
  failureRate: number
  hitlRate: number
  avgDurationMs: number
  totalTokens: number
  totalCostRmb: string
  activeEmployees: number
}

/** Daily detail per employee */
export interface EmployeeDailyDetail {
  employeeName: string
  taskCount: number
  successCount: number
  failureCount: number
}

/** Trend data point */
export interface TrendDataPoint {
  date: string
  totalTasks: number
  successCount: number
  failureCount: number
  hitlCount: number
  successRate: number
  costRmb: string
  tokensConsumed: number
  employeeDetails: EmployeeDailyDetail[]
}

/** Employee comparison row */
export interface EmployeeComparisonRow {
  employeeId: string
  employeeName: string
  totalTasks: number
  successRate: number
  failureRate: number
  avgDurationMs: number
  totalTokens: number
  totalCostRmb: string
  conversationCount: number
}

/** Cost by employee (data source: conversations table) */
export interface CostByEmployee {
  employeeId: string
  employeeName: string
  totalTokens: number
}

/** Cost by model */
export interface CostByModel {
  model: string
  totalCostRmb: string
}

/** Daily cost data point(split by model) */
export interface DailyCostPoint {
  date: string
  costRmb: string
  models: Record<string, number>
}

/** Tokens by model */
export interface TokenByModel {
  model: string
  tokens: number
}

/** Overview API response */
export interface OverviewResponse {
  success: boolean
  data: OverviewMetrics
}

/** Trends API response */
export interface TrendsResponse {
  success: boolean
  data: TrendDataPoint[]
}

/** Daily token data point */
export interface DailyTokenPoint {
  date: string
  tokens: number
}

/** Cost API response */
export interface CostResponse {
  success: boolean
  data: {
    allModels: string[]
    costByEmployee: CostByEmployee[]
    costByModel: CostByModel[]
    dailyCost: DailyCostPoint[]
    dailyTokens: DailyTokenPoint[]
    tokensByModel: TokenByModel[]
  }
}

/** Employee comparison API response */
export interface EmployeesComparisonResponse {
  success: boolean
  data: EmployeeComparisonRow[]
}

/** Report type */
export type ReportType = 'monthly' | 'quarterly' | 'custom'

/** Report generation request body */
export interface ReportRequest {
  reportType: ReportType
  dateFrom: string
  dateTo: string
}

/** Report config(frontend dialog state) */
export interface ReportConfig {
  reportType: ReportType
  dateFrom: string
  dateTo: string
}

/** Report type option */
export interface ReportTypeOption {
  key: ReportType
  label: string
  description: string
}

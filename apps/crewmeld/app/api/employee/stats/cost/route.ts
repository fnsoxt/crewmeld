import { db } from '@crewmeld/db'
import { conversations, digitalEmployees, modelConfigs, modelUsageLogs } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, gte, lt, sql } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { formatISODate } from '@/lib/core/utils/formatting'

const logger = createLogger('StatsCostAPI')

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('employee:list')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { searchParams } = new URL(request.url)

    const now = new Date()
    const defaultFrom = new Date(now)
    defaultFrom.setDate(defaultFrom.getDate() - 7)

    const dateFrom = searchParams.get('date_from') ?? formatISODate(defaultFrom)
    const dateTo = searchParams.get('date_to') ?? formatISODate(now)

    if (!DATE_REGEX.test(dateFrom) || !DATE_REGEX.test(dateTo)) {
      return apiErr('api.stat.dateFormatInvalid', { status: 400 })
    }

    const rangeStart = new Date(`${dateFrom}T00:00:00Z`)
    // End time is next day 00:00:00 of dateTo, to cover records from all timezones
    const nextDay = new Date(`${dateTo}T00:00:00Z`)
    nextDay.setDate(nextDay.getDate() + 1)
    const rangeEnd = nextDay

    logger.info('[Query] Start fetching cost data', {
      dateFrom,
      dateTo,
      rangeStartISO: rangeStart.toISOString(),
      rangeEndISO: rangeEnd.toISOString(),
    })

    const dateCondition = and(
      gte(modelUsageLogs.createdAt, rangeStart),
      lt(modelUsageLogs.createdAt, rangeEnd)
    )

    // First check total rows to confirm table has data
    const totalCount = await db.select({ count: sql<number>`count(*)::int` }).from(modelUsageLogs)
    const rangeCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(modelUsageLogs)
      .where(dateCondition)

    // Also check earliest and latest record times
    const timeRange = await db
      .select({
        earliest: sql<string>`MIN(${modelUsageLogs.createdAt})::text`,
        latest: sql<string>`MAX(${modelUsageLogs.createdAt})::text`,
      })
      .from(modelUsageLogs)

    logger.info('[Query] model_usage_logs row counts', {
      total: totalCount[0]?.count ?? 0,
      inRange: rangeCount[0]?.count ?? 0,
      dateFrom,
      dateTo,
      earliestRecord: timeRange[0]?.earliest,
      latestRecord: timeRange[0]?.latest,
    })

    // 1. Aggregate tokens and cost by model
    const modelAgg = await db
      .select({
        model: modelUsageLogs.model,
        totalTokens: sql<number>`COALESCE(SUM(${modelUsageLogs.tokensTotal}), 0)::int`,
        totalCost: sql<string>`COALESCE(SUM(${modelUsageLogs.costTotal}), 0)::numeric(12,6)`,
      })
      .from(modelUsageLogs)
      .where(dateCondition)
      .groupBy(modelUsageLogs.model)

    logger.info('[Query] Aggregated results by model', {
      count: modelAgg.length,
      models: modelAgg.map((r) => ({ model: r.model, tokens: r.totalTokens, cost: r.totalCost })),
    })

    const tokensByModelMap = new Map<string, number>()
    const costByModelMap = new Map<string, number>()
    for (const row of modelAgg) {
      tokensByModelMap.set(row.model, Number(row.totalTokens))
      costByModelMap.set(row.model, Number(row.totalCost))
    }

    // 2. Aggregate tokens by employee (source: conversations table, consistent with performance overview/employee comparison)
    const empTokenRows = await db
      .select({
        employeeId: conversations.employeeId,
        totalTokens: sql<number>`COALESCE(SUM(${conversations.totalTokens}), 0)::int`,
      })
      .from(conversations)
      .where(
        and(
          sql`${conversations.createdAt} >= ${dateFrom}::date`,
          sql`${conversations.createdAt} < (${dateTo}::date + interval '1 day')`
        )
      )
      .groupBy(conversations.employeeId)

    // Query employee names
    const allEmployees = await db
      .select({ id: digitalEmployees.id, name: digitalEmployees.name })
      .from(digitalEmployees)
    const empNameMap = new Map<string, string>()
    for (const e of allEmployees) {
      empNameMap.set(e.id, e.name)
    }

    const costByEmployee = empTokenRows
      .filter((r) => r.employeeId && r.totalTokens > 0)
      .map((r) => ({
        employeeId: r.employeeId!,
        employeeName: empNameMap.get(r.employeeId!) ?? 'Unknown employee',
        totalTokens: r.totalTokens,
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens)

    // 3. Aggregate by date + model (cost + tokens)
    const dailyModelAgg = await db
      .select({
        date: sql<string>`${modelUsageLogs.createdAt}::date::text`,
        model: modelUsageLogs.model,
        totalCost: sql<string>`COALESCE(SUM(${modelUsageLogs.costTotal}), 0)::numeric(12,6)`,
        totalTokens: sql<number>`COALESCE(SUM(${modelUsageLogs.tokensTotal}), 0)::int`,
      })
      .from(modelUsageLogs)
      .where(dateCondition)
      .groupBy(sql`${modelUsageLogs.createdAt}::date`, modelUsageLogs.model)

    const dailyCostMap = new Map<string, Map<string, number>>()
    const dailyTokenMap = new Map<string, number>()
    for (const row of dailyModelAgg) {
      if (!dailyCostMap.has(row.date)) {
        dailyCostMap.set(row.date, new Map())
      }
      dailyCostMap.get(row.date)!.set(row.model, Number(row.totalCost))
      dailyTokenMap.set(row.date, (dailyTokenMap.get(row.date) ?? 0) + Number(row.totalTokens))
    }

    // 4. Query all configured models from model_configs
    const configuredModels = await db
      .select({ displayName: modelConfigs.displayName, modelName: modelConfigs.modelName })
      .from(modelConfigs)

    logger.info('[Query] model_configs configured models', {
      count: configuredModels.length,
      models: configuredModels.map((cm) => ({
        displayName: cm.displayName,
        modelName: cm.modelName,
      })),
    })

    // Build mapping from technical model ID → configured display name
    const modelDisplayNameMap = new Map<string, string>()
    for (const cm of configuredModels) {
      if (cm.modelName && cm.displayName) {
        modelDisplayNameMap.set(cm.modelName, cm.displayName)
      }
      // displayName itself may also appear in logs (fallback to displayName when modelName is empty)
      if (cm.displayName) {
        modelDisplayNameMap.set(cm.displayName, cm.displayName)
      }
    }

    /** Convert technical model ID in logs to config display name */
    function toDisplayName(model: string): string {
      if (!model || !model.trim()) return 'Unknown model'
      // Exact match
      const exact = modelDisplayNameMap.get(model)
      if (exact) return exact
      // Fuzzy match: provider may return variant names (e.g. qwen-plus-latest vs configured qwen-plus)
      for (const [key, displayName] of modelDisplayNameMap) {
        if (model.startsWith(key) || key.startsWith(model)) {
          return displayName
        }
      }
      return model
    }

    // Re-aggregate by display name (different technical IDs may map to same display name)
    const displayTokens = new Map<string, number>()
    const displayCost = new Map<string, number>()
    for (const [model, tokens] of tokensByModelMap) {
      const name = toDisplayName(model)
      displayTokens.set(name, (displayTokens.get(name) ?? 0) + tokens)
    }
    for (const [model, cost] of costByModelMap) {
      const name = toDisplayName(model)
      displayCost.set(name, (displayCost.get(name) ?? 0) + cost)
    }

    // Add configured but unused models
    for (const cm of configuredModels) {
      const name = cm.displayName || cm.modelName
      if (name && !displayTokens.has(name)) {
        displayTokens.set(name, 0)
        displayCost.set(name, 0)
      }
    }

    const allDisplayNames = new Set<string>([...displayTokens.keys(), ...displayCost.keys()])

    logger.info('[Query] Final model list (display names)', {
      allModels: Array.from(allDisplayNames),
    })

    // Format output
    const tokensByModel = Array.from(allDisplayNames)
      .map((model) => ({ model, tokens: displayTokens.get(model) ?? 0 }))
      .sort((a, b) => b.tokens - a.tokens)

    const costByModel = Array.from(allDisplayNames)
      .map((model) => ({ model, totalCostRmb: (displayCost.get(model) ?? 0).toFixed(6) }))
      .sort((a, b) => Number(b.totalCostRmb) - Number(a.totalCostRmb))

    // Re-aggregate daily data by display name
    const dailyDisplayCostMap = new Map<string, Map<string, number>>()
    for (const row of dailyModelAgg) {
      const name = toDisplayName(row.model)
      if (!dailyDisplayCostMap.has(row.date)) {
        dailyDisplayCostMap.set(row.date, new Map())
      }
      const dayMap = dailyDisplayCostMap.get(row.date)!
      dayMap.set(name, (dayMap.get(name) ?? 0) + Number(row.totalCost))
    }

    // Fill every day in date range
    const dailyCost: { date: string; costRmb: string; models: Record<string, number> }[] = []
    const dailyTokens: { date: string; tokens: number }[] = []
    const startDate = new Date(`${dateFrom}T00:00:00Z`)
    const endDate = new Date(`${dateTo}T00:00:00Z`)
    for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
      const dateKey = d.toISOString().split('T')[0]
      const dayModels = dailyDisplayCostMap.get(dateKey)
      const models: Record<string, number> = {}
      let dayTotal = 0
      for (const m of allDisplayNames) {
        const val = dayModels?.get(m) ?? 0
        models[m] = val
        dayTotal += val
      }
      dailyCost.push({ date: dateKey, costRmb: dayTotal.toFixed(6), models })
      dailyTokens.push({ date: dateKey, tokens: dailyTokenMap.get(dateKey) ?? 0 })
    }

    logger.info(
      `Report cost (model_usage_logs): ${dateFrom} to ${dateTo}, ${allDisplayNames.size} models`
    )

    return apiOk({
      allModels: Array.from(allDisplayNames),
      costByEmployee,
      costByModel,
      dailyCost,
      dailyTokens,
      tokensByModel,
    })
  } catch (error) {
    logger.error('Failed to fetch report cost', error)
    return apiErr('api.stat.fetchCostFailed', { status: 500 })
  }
}

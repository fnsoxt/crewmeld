import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db } from '@crewmeld/db'
import {
  conversationMessages,
  conversations,
  dailyStats,
  digitalEmployees,
  employeeWorkflowBindings,
  modelConfigs,
  modelUsageLogs,
  sopDefinitions,
  sopExecutions,
  taskExecutions,
} from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import fontkit from '@pdf-lib/fontkit'
import { and, count, eq, gte, lt, lte, sql } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from 'pdf-lib'
import { apiAuthErr, apiErr } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { DEFAULT_LOCALE, LOCALES, type Locale, messages } from '@/locales'

const logger = createLogger('StatsReportAPI')

const VALID_REPORT_TYPES = ['monthly', 'quarterly', 'custom'] as const
type ReportType = (typeof VALID_REPORT_TYPES)[number]

const PAGE_W = 595.28
const PAGE_H = 841.89
const ML = 50 // margin left
const MR = 50
const MT = 60
const MB = 60
const CW = PAGE_W - ML - MR // content width
const FY = 30 // footer y

const C_BLACK = rgb(0, 0, 0)
const C_GRAY = rgb(0.4, 0.4, 0.4)
const C_LGRAY = rgb(0.85, 0.85, 0.85)
const C_DGRAY = rgb(0.2, 0.2, 0.2)
const C_HEADER = rgb(0.94, 0.94, 0.96)

/** Simple server-side interpolation: replaces {key} placeholders */
function interpolate(template: string, vars: Record<string, string | number>): string {
  let result = template
  for (const [k, v] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
  }
  return result
}

/** Resolve locale from request body */
function resolveLocale(param: string | null | undefined): Locale {
  if (param && (LOCALES as string[]).includes(param)) return param as Locale
  return DEFAULT_LOCALE
}

// ---------------------------------------------------------------------------
// PDF helpers
// ---------------------------------------------------------------------------

/** Convert milliseconds to readable duration (i18n) */
function formatDuration(ms: number, l: (typeof messages)['zh-CN']['stats']): string {
  if (ms <= 0) return '-'
  if (ms < 1000) return interpolate(l.pdfDurationMs, { value: ms })
  if (ms < 60_000) return interpolate(l.pdfDurationSec, { value: (ms / 1000).toFixed(1) })
  const min = Math.floor(ms / 60_000)
  const sec = Math.round((ms % 60_000) / 1000)
  return sec > 0
    ? interpolate(l.pdfDurationMinSec, { min, sec })
    : interpolate(l.pdfDurationMin, { min })
}

async function loadFont(doc: PDFDocument): Promise<PDFFont> {
  try {
    doc.registerFontkit(fontkit)
    return await doc.embedFont(
      await readFile(join(process.cwd(), 'public', 'fonts', 'NotoSansSC-Regular.ttf'))
    )
  } catch {
    return await doc.embedFont(StandardFonts.Helvetica)
  }
}

async function loadBoldFont(doc: PDFDocument): Promise<PDFFont> {
  try {
    doc.registerFontkit(fontkit)
    return await doc.embedFont(
      await readFile(join(process.cwd(), 'public', 'fonts', 'NotoSansSC-Bold.ttf'))
    )
  } catch {
    return await doc.embedFont(StandardFonts.HelveticaBold)
  }
}

function footer(p: PDFPage, f: PDFFont, n: number, total: number, footerText: string) {
  p.drawText(footerText, { x: ML, y: FY, size: 8, font: f, color: C_GRAY })
  const t = `${n} / ${total}`
  p.drawText(t, {
    x: PAGE_W - MR - f.widthOfTextAtSize(t, 8),
    y: FY,
    size: 8,
    font: f,
    color: C_GRAY,
  })
  p.drawLine({
    start: { x: ML, y: FY + 15 },
    end: { x: PAGE_W - MR, y: FY + 15 },
    thickness: 0.5,
    color: C_LGRAY,
  })
}

function hline(p: PDFPage, y: number, c = C_LGRAY, t = 0.5) {
  p.drawLine({ start: { x: ML, y }, end: { x: PAGE_W - MR, y }, thickness: t, color: c })
}

function sectionTitle(p: PDFPage, bf: PDFFont, title: string, y: number): number {
  p.drawText(title, { x: ML, y, size: 16, font: bf, color: C_BLACK })
  y -= 8
  hline(p, y, C_DGRAY, 1)
  return y - 24
}

function subTitle(p: PDFPage, bf: PDFFont, title: string, y: number): number {
  p.drawText(title, { x: ML, y, size: 11, font: bf, color: C_DGRAY })
  return y - 18
}

/** Draw key-value table */
function kvTable(
  p: PDFPage,
  f: PDFFont,
  bf: PDFFont,
  rows: [string, string][],
  y: number,
  colMetric: string,
  colValue: string
): number {
  const rh = 28
  const lw = 200
  // header
  p.drawRectangle({ x: ML, y: y - rh + 8, width: CW, height: rh, color: C_HEADER })
  p.drawText(colMetric, { x: ML + 10, y: y - rh + 16, size: 9, font: bf, color: C_DGRAY })
  p.drawText(colValue, { x: ML + lw + 10, y: y - rh + 16, size: 9, font: bf, color: C_DGRAY })
  hline(p, y - rh + 8)
  y -= rh
  for (const [label, value] of rows) {
    p.drawText(label, { x: ML + 10, y: y - rh + 16, size: 9, font: f, color: C_DGRAY })
    p.drawText(value, { x: ML + lw + 10, y: y - rh + 16, size: 9, font: f, color: C_BLACK })
    y -= rh
    hline(p, y + 8)
  }
  return y
}

/** Draw multi-column table, return remaining y */
function table(
  p: PDFPage,
  f: PDFFont,
  bf: PDFFont,
  cols: [string, number][],
  data: string[][],
  y: number,
  empty: string
): number {
  const rh = 20
  const fs = 7
  p.drawRectangle({ x: ML, y: y - rh + 6, width: CW, height: rh, color: C_HEADER })
  let cx = ML + 6
  for (const [label, w] of cols) {
    p.drawText(label, { x: cx, y: y - rh + 12, size: fs, font: bf, color: C_DGRAY })
    cx += w
  }
  hline(p, y - rh + 6)
  y -= rh
  if (data.length === 0) {
    p.drawText(empty, { x: ML + CW / 2 - 20, y: y - 30, size: 9, font: f, color: C_GRAY })
    return y - 50
  }
  for (const row of data) {
    if (y - rh < MB + 20) break
    cx = ML + 6
    for (let i = 0; i < cols.length; i++) {
      p.drawText(row[i] ?? '', { x: cx, y: y - rh + 12, size: fs, font: f, color: C_BLACK })
      cx += cols[i][1]
    }
    y -= rh
    hline(p, y + 6)
  }
  return y
}

// ---------------------------------------------------------------------------
// Data fetching (reuse same logic as frontend APIs)
// ---------------------------------------------------------------------------

interface OverviewData {
  totalTasks: number
  successRate: number
  failureRate: number
  hitlRate: number
  avgDurationMs: number
  totalTokens: number
  totalCostRmb: string
  activeEmployees: number
}

/** Core metrics: consistent with overview API, real-time query from sopExecutions */
async function fetchOverview(dateFrom: string, dateTo: string): Promise<OverviewData> {
  const [exec] = await db
    .select({
      totalTasks: count(),
      completedCount: sql<number>`COUNT(*) FILTER (WHERE ${sopExecutions.status} IN ('completed','running','paused_for_human'))::int`,
      failureCount: sql<number>`COUNT(*) FILTER (WHERE ${sopExecutions.status} IN ('failed','timed_out','error'))::int`,
      hitlCount: sql<number>`COUNT(*) FILTER (WHERE ${sopExecutions.status} = 'paused_for_human')::int`,
    })
    .from(sopExecutions)
    .where(
      and(
        gte(sopExecutions.createdAt, sql`${dateFrom}::date`),
        lte(sopExecutions.createdAt, sql`(${dateTo}::date + interval '1 day')`)
      )
    )

  const [stats] = await db
    .select({
      avgDurationMs: sql<number>`COALESCE(AVG(${dailyStats.avgDurationMs}), 0)::int`,
      totalTokens: sql<number>`COALESCE(SUM(${dailyStats.tokensConsumed}), 0)::int`,
      totalCostRmb: sql<string>`COALESCE(SUM(${dailyStats.costRmb}), 0)::numeric(12,4)`,
    })
    .from(dailyStats)
    .where(and(gte(dailyStats.statDate, dateFrom), lte(dailyStats.statDate, dateTo)))

  const [emp] = await db
    .select({ cnt: count() })
    .from(digitalEmployees)
    .where(eq(digitalEmployees.status, 'active'))

  const total = exec?.totalTasks ?? 0
  const completed = exec?.completedCount ?? 0
  const failed = exec?.failureCount ?? 0
  const hitl = exec?.hitlCount ?? 0
  return {
    totalTasks: total,
    successRate: total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 0,
    failureRate: total > 0 ? Number(((failed / total) * 100).toFixed(1)) : 0,
    hitlRate: total > 0 ? Number(((hitl / total) * 100).toFixed(1)) : 0,
    avgDurationMs: stats?.avgDurationMs ?? 0,
    totalTokens: stats?.totalTokens ?? 0,
    totalCostRmb: stats?.totalCostRmb ?? '0.0000',
    activeEmployees: emp?.cnt ?? 0,
  }
}

interface TrendPoint {
  date: string
  totalTasks: number
  successCount: number
  failureCount: number
  hitlCount: number
  successRate: number
}

/** Trends: consistent with trends API, real-time query from sopExecutions */
async function fetchTrends(dateFrom: string, dateTo: string): Promise<TrendPoint[]> {
  const dateExpr = sql`(${sopExecutions.createdAt}::date)::text`
  const rows = await db
    .select({
      date: dateExpr,
      totalTasks: sql<number>`COUNT(*)::int`,
      successCount: sql<number>`COUNT(*) FILTER (WHERE ${sopExecutions.status} IN ('completed','running','paused_for_human'))::int`,
      failureCount: sql<number>`COUNT(*) FILTER (WHERE ${sopExecutions.status} IN ('failed','timed_out','error'))::int`,
      hitlCount: sql<number>`COUNT(*) FILTER (WHERE ${sopExecutions.status} = 'paused_for_human')::int`,
    })
    .from(sopExecutions)
    .where(
      and(
        gte(sopExecutions.createdAt, sql`${dateFrom}::date`),
        lte(sopExecutions.createdAt, sql`(${dateTo}::date + interval '1 day')`)
      )
    )
    .groupBy(dateExpr)

  const map = new Map<string, (typeof rows)[number]>()
  for (const r of rows) if (r.date) map.set(String(r.date), r)

  const result: TrendPoint[] = []
  const start = new Date(`${dateFrom}T00:00:00Z`)
  const end = new Date(`${dateTo}T00:00:00Z`)
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dk = d.toISOString().split('T')[0]
    const r = map.get(dk)
    const total = r?.totalTasks ?? 0
    result.push({
      date: dk,
      totalTasks: total,
      successCount: r?.successCount ?? 0,
      failureCount: r?.failureCount ?? 0,
      hitlCount: r?.hitlCount ?? 0,
      successRate: total > 0 ? Number(((r!.successCount / total) * 100).toFixed(1)) : 0,
    })
  }
  return result
}

interface EmpRow {
  name: string
  totalTasks: number
  successRate: number
  failureRate: number
  avgDurationMs: number
  totalTokens: number
  totalCostRmb: string
  conversationCount: number
}

/** Employee comparison: consistent with employees API, multi-table join */
async function fetchEmployees(
  dateFrom: string,
  dateTo: string,
  unknownLabel: string
): Promise<EmpRow[]> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    WITH task_stats AS (
      SELECT te.employee_id, COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE te.status IN ('success','running','hitl_waiting'))::int AS success_cnt,
        COUNT(*) FILTER (WHERE te.status = 'failed')::int AS failure_cnt,
        COALESCE(AVG(te.duration_ms),0)::int AS avg_dur,
        COALESCE(SUM(te.tokens_used),0)::int AS tokens,
        COALESCE(SUM(te.cost_rmb),0)::numeric(12,4) AS cost
      FROM ${taskExecutions} te
      WHERE te.created_at >= ${dateFrom}::date AND te.created_at < (${dateTo}::date + interval '1 day')
      GROUP BY te.employee_id
    ),
    sop_stats AS (
      SELECT de.id AS employee_id,
        COUNT(DISTINCT se.id)::int AS total,
        COUNT(DISTINCT se.id) FILTER (WHERE se.status IN ('completed','running','paused_for_human'))::int AS success_cnt,
        COUNT(DISTINCT se.id) FILTER (WHERE se.status IN ('failed','timed_out','error'))::int AS failure_cnt
      FROM ${digitalEmployees} de
      INNER JOIN ${sopDefinitions} sd ON sd.is_active = true
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(sd.nodes) AS node WHERE node->>'type'='digital_employee' AND node->>'executorId'=de.id)
      LEFT JOIN ${sopExecutions} se ON se.sop_definition_id = sd.id
        AND se.created_at >= ${dateFrom}::date AND se.created_at < (${dateTo}::date + interval '1 day')
      GROUP BY de.id
    ),
    daily_agg AS (
      SELECT ds.employee_id, COALESCE(SUM(ds.total_tasks),0)::int AS total,
        COALESCE(SUM(ds.success_count),0)::int AS success_cnt, COALESCE(SUM(ds.failure_count),0)::int AS failure_cnt,
        COALESCE(AVG(ds.avg_duration_ms),0)::int AS avg_dur, COALESCE(SUM(ds.tokens_consumed),0)::int AS tokens,
        COALESCE(SUM(ds.cost_rmb),0)::numeric(12,4) AS cost
      FROM ${dailyStats} ds WHERE ds.stat_date >= ${dateFrom} AND ds.stat_date <= ${dateTo}
      GROUP BY ds.employee_id
    ),
    conv_stats AS (
      SELECT c.employee_id, COUNT(*)::int AS cnt, COALESCE(SUM(c.total_tokens),0)::int AS tokens
      FROM ${conversations} c
      WHERE c.created_at >= ${dateFrom}::date AND c.created_at < (${dateTo}::date + interval '1 day')
      GROUP BY c.employee_id
    ),
    msg_with_lag AS (
      SELECT c.employee_id, cm.role,
        EXTRACT(EPOCH FROM (cm.created_at - LAG(cm.created_at) OVER (PARTITION BY cm.conversation_id ORDER BY cm.created_at))) * 1000 AS gap_ms
      FROM ${conversationMessages} cm
      INNER JOIN ${conversations} c ON c.id = cm.conversation_id
      WHERE c.created_at >= ${dateFrom}::date AND c.created_at < (${dateTo}::date + interval '1 day')
    ),
    reply_avg AS (
      SELECT employee_id, COALESCE(AVG(gap_ms) FILTER (WHERE gap_ms > 0), 0)::int AS avg_dur
      FROM msg_with_lag WHERE role = 'assistant' AND gap_ms IS NOT NULL
      GROUP BY employee_id
    ),
    model_usage_agg AS (
      SELECT ewb.employee_id, COALESCE(SUM(mul.tokens_total),0)::int AS tokens, COALESCE(SUM(mul.cost_total),0)::numeric(12,4) AS cost
      FROM ${modelUsageLogs} mul INNER JOIN ${employeeWorkflowBindings} ewb ON ewb.workflow_id = mul.workflow_id
      WHERE mul.created_at >= ${dateFrom}::date AND mul.created_at < (${dateTo}::date + interval '1 day')
      GROUP BY ewb.employee_id
    )
    SELECT de.id AS employee_id, de.name AS employee_name,
      GREATEST(COALESCE(ts.total,0),COALESCE(ss.total,0),COALESCE(da.total,0))::int AS total_tasks,
      GREATEST(COALESCE(ts.success_cnt,0),COALESCE(ss.success_cnt,0),COALESCE(da.success_cnt,0))::int AS success_count,
      GREATEST(COALESCE(ts.failure_cnt,0),COALESCE(ss.failure_cnt,0),COALESCE(da.failure_cnt,0))::int AS failure_count,
      GREATEST(COALESCE(ts.avg_dur,0),COALESCE(da.avg_dur,0),COALESCE(ra.avg_dur,0))::int AS avg_duration_ms,
      GREATEST(COALESCE(mu.tokens,0),COALESCE(ts.tokens,0),COALESCE(da.tokens,0),COALESCE(cs.tokens,0))::int AS total_tokens,
      GREATEST(COALESCE(mu.cost,0),COALESCE(ts.cost,0),COALESCE(da.cost,0))::numeric(12,4) AS total_cost_rmb,
      COALESCE(cs.cnt,0)::int AS conversation_count
    FROM ${digitalEmployees} de
    LEFT JOIN task_stats ts ON ts.employee_id = de.id
    LEFT JOIN sop_stats ss ON ss.employee_id = de.id
    LEFT JOIN daily_agg da ON da.employee_id = de.id
    LEFT JOIN conv_stats cs ON cs.employee_id = de.id
    LEFT JOIN reply_avg ra ON ra.employee_id = de.id
    LEFT JOIN model_usage_agg mu ON mu.employee_id = de.id
    ORDER BY total_tasks DESC
  `)

  return rows.map((r: Record<string, unknown>) => {
    const total = Number(r.total_tasks ?? 0)
    const sc = Number(r.success_count ?? 0)
    const fc = Number(r.failure_count ?? 0)
    return {
      name: (r.employee_name as string) ?? unknownLabel,
      totalTasks: total,
      successRate: total > 0 ? Number(((sc / total) * 100).toFixed(1)) : 0,
      failureRate: total > 0 ? Number(((fc / total) * 100).toFixed(1)) : 0,
      avgDurationMs: Number(r.avg_duration_ms ?? 0),
      totalTokens: Number(r.total_tokens ?? 0),
      totalCostRmb: String(r.total_cost_rmb ?? '0'),
      conversationCount: Number(r.conversation_count ?? 0),
    }
  })
}

interface CostData {
  tokensByModel: { model: string; tokens: number }[]
  employeeTokens: { name: string; tokens: number }[]
  dailyTokens: { date: string; tokens: number }[]
}

async function fetchCost(
  dateFrom: string,
  dateTo: string,
  unknownModel: string,
  unknownEmployee: string
): Promise<CostData> {
  const rangeStart = new Date(`${dateFrom}T00:00:00Z`)
  const rangeNext = new Date(`${dateTo}T00:00:00Z`)
  rangeNext.setDate(rangeNext.getDate() + 1)
  const cond = and(
    gte(modelUsageLogs.createdAt, rangeStart),
    lt(modelUsageLogs.createdAt, rangeNext)
  )

  // Aggregate by model
  const modelAgg = await db
    .select({
      model: modelUsageLogs.model,
      tokens: sql<number>`COALESCE(SUM(${modelUsageLogs.tokensTotal}),0)::int`,
    })
    .from(modelUsageLogs)
    .where(cond)
    .groupBy(modelUsageLogs.model)

  // displayName mapping
  const cfgs = await db
    .select({ dn: modelConfigs.displayName, mn: modelConfigs.modelName })
    .from(modelConfigs)
  const dnMap = new Map<string, string>()
  for (const c of cfgs) {
    if (c.mn && c.dn) dnMap.set(c.mn, c.dn)
    if (c.dn) dnMap.set(c.dn, c.dn)
  }
  const dn = (m: string) => {
    if (!m?.trim()) return unknownModel
    const e = dnMap.get(m)
    if (e) return e
    for (const [k, v] of dnMap) {
      if (m.startsWith(k) || k.startsWith(m)) return v
    }
    return m
  }

  const dtMap = new Map<string, number>()
  for (const r of modelAgg) {
    const n = dn(r.model)
    dtMap.set(n, (dtMap.get(n) ?? 0) + Number(r.tokens))
  }
  const tokensByModel = [...dtMap.entries()]
    .map(([model, tokens]) => ({ model, tokens }))
    .sort((a, b) => b.tokens - a.tokens)

  // By employee (conversations)
  const empAgg = await db
    .select({
      eid: conversations.employeeId,
      tokens: sql<number>`COALESCE(SUM(${conversations.totalTokens}),0)::int`,
    })
    .from(conversations)
    .where(
      and(
        sql`${conversations.createdAt} >= ${dateFrom}::date`,
        sql`${conversations.createdAt} < (${dateTo}::date + interval '1 day')`
      )
    )
    .groupBy(conversations.employeeId)

  const allEmp = await db
    .select({ id: digitalEmployees.id, name: digitalEmployees.name })
    .from(digitalEmployees)
  const enMap = new Map<string, string>()
  for (const e of allEmp) enMap.set(e.id, e.name)
  const employeeTokens = empAgg
    .filter((r) => r.eid && r.tokens > 0)
    .map((r) => ({ name: enMap.get(r.eid!) ?? unknownEmployee, tokens: r.tokens }))
    .sort((a, b) => b.tokens - a.tokens)

  // Daily tokens
  const dailyAgg = await db
    .select({
      date: sql<string>`${modelUsageLogs.createdAt}::date::text`,
      tokens: sql<number>`COALESCE(SUM(${modelUsageLogs.tokensTotal}),0)::int`,
    })
    .from(modelUsageLogs)
    .where(cond)
    .groupBy(sql`${modelUsageLogs.createdAt}::date`)

  const dMap = new Map<string, number>()
  for (const r of dailyAgg) dMap.set(r.date, Number(r.tokens))

  const dailyTokens: CostData['dailyTokens'] = []
  const s = new Date(`${dateFrom}T00:00:00Z`)
  const e = new Date(`${dateTo}T00:00:00Z`)
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    const dk = d.toISOString().split('T')[0]
    dailyTokens.push({ date: dk, tokens: dMap.get(dk) ?? 0 })
  }

  return { tokensByModel, employeeTokens, dailyTokens }
}

// ---------------------------------------------------------------------------
// PDF pages
// ---------------------------------------------------------------------------

function drawCover(
  p: PDFPage,
  f: PDFFont,
  bf: PDFFont,
  rt: ReportType,
  df: string,
  dt: string,
  gen: string,
  l: (typeof messages)['zh-CN']['stats']
) {
  const cx = PAGE_W / 2
  const ty = PAGE_H - 280
  const pn = l.pdfPlatformName
  p.drawText(pn, {
    x: cx - bf.widthOfTextAtSize(pn, 16) / 2,
    y: ty + 60,
    size: 16,
    font: bf,
    color: C_GRAY,
  })
  p.drawLine({
    start: { x: cx - 100, y: ty + 45 },
    end: { x: cx + 100, y: ty + 45 },
    thickness: 1,
    color: C_LGRAY,
  })
  const typeLabels: Record<ReportType, string> = {
    monthly: l.pdfTypeMonthly,
    quarterly: l.pdfTypeQuarterly,
    custom: l.pdfTypeCustom,
  }
  const t = typeLabels[rt]
  p.drawText(t, {
    x: cx - bf.widthOfTextAtSize(t, 24) / 2,
    y: ty,
    size: 24,
    font: bf,
    color: C_BLACK,
  })
  const dr = interpolate(l.pdfReportPeriod, { from: df, to: dt })
  p.drawText(dr, {
    x: cx - f.widthOfTextAtSize(dr, 12) / 2,
    y: ty - 40,
    size: 12,
    font: f,
    color: C_DGRAY,
  })
  const gt = interpolate(l.pdfGeneratedAt, { time: gen })
  p.drawText(gt, {
    x: cx - f.widthOfTextAtSize(gt, 10) / 2,
    y: ty - 65,
    size: 10,
    font: f,
    color: C_GRAY,
  })
}

function drawOverview(
  p: PDFPage,
  f: PDFFont,
  bf: PDFFont,
  o: OverviewData,
  l: (typeof messages)['zh-CN']['stats']
) {
  const y = sectionTitle(p, bf, l.pdfSectionCoreMetrics, PAGE_H - MT)
  kvTable(
    p,
    f,
    bf,
    [
      [l.pdfMetricTotalTasks, `${o.totalTasks}`],
      [l.pdfMetricSuccessRate, `${o.successRate}%`],
      [l.pdfMetricErrorRate, `${o.failureRate}%`],
      [l.pdfMetricHitlRate, `${o.hitlRate}%`],
      [l.pdfMetricAvgDuration, formatDuration(o.avgDurationMs, l)],
      [l.pdfMetricTokenUsage, o.totalTokens.toLocaleString()],
      [l.pdfMetricActiveEmployees, `${o.activeEmployees}`],
    ],
    y,
    l.pdfColMetric,
    l.pdfColValue
  )
}

/** Draw trend table with auto-pagination, return extra pages created */
function drawTrends(
  firstPage: PDFPage,
  doc: PDFDocument,
  f: PDFFont,
  bf: PDFFont,
  trends: TrendPoint[],
  l: (typeof messages)['zh-CN']['stats']
): PDFPage[] {
  const cols: [string, number][] = [
    [l.pdfColDate, 100],
    [l.pdfColTasks, 70],
    [l.pdfColSuccess, 60],
    [l.pdfColFailure, 60],
    [l.pdfColApproval, 60],
    [l.pdfColSuccessRate, 70],
    [l.pdfColErrorRate, 75],
  ]
  const data = trends.map((t) => [
    t.date,
    `${t.totalTasks}`,
    `${t.successCount}`,
    `${t.failureCount}`,
    `${t.hitlCount}`,
    `${t.successRate}%`,
    t.totalTasks > 0 ? `${((t.failureCount / t.totalTasks) * 100).toFixed(1)}%` : '0%',
  ])

  const rh = 20
  const fs = 7
  const extraPages: PDFPage[] = []
  let page = firstPage
  let y = sectionTitle(page, bf, l.pdfSectionTrends, PAGE_H - MT)

  // Draw header
  function drawHeader(p: PDFPage, startY: number): number {
    p.drawRectangle({ x: ML, y: startY - rh + 6, width: CW, height: rh, color: C_HEADER })
    let cx = ML + 6
    for (const [label, w] of cols) {
      p.drawText(label, { x: cx, y: startY - rh + 12, size: fs, font: bf, color: C_DGRAY })
      cx += w
    }
    hline(p, startY - rh + 6)
    return startY - rh
  }

  y = drawHeader(page, y)

  for (const row of data) {
    if (y - rh < MB + 20) {
      const newPage = doc.addPage([PAGE_W, PAGE_H])
      extraPages.push(newPage)
      page = newPage
      y = sectionTitle(page, bf, l.pdfSectionTrendsCont, PAGE_H - MT)
      y = drawHeader(page, y)
    }
    let cx = ML + 6
    for (let i = 0; i < cols.length; i++) {
      page.drawText(row[i] ?? '', { x: cx, y: y - rh + 12, size: fs, font: f, color: C_BLACK })
      cx += cols[i][1]
    }
    y -= rh
    hline(page, y + 6)
  }

  if (data.length === 0) {
    page.drawText(l.pdfNoData, { x: ML + CW / 2 - 20, y: y - 30, size: 9, font: f, color: C_GRAY })
  }

  return extraPages
}

function drawEmployees(
  p: PDFPage,
  f: PDFFont,
  bf: PDFFont,
  emps: EmpRow[],
  l: (typeof messages)['zh-CN']['stats']
) {
  const y = sectionTitle(p, bf, l.pdfSectionEmployees, PAGE_H - MT)
  const cols: [string, number][] = [
    [l.pdfColEmployee, 90],
    [l.pdfColTasks, 60],
    [l.pdfColSuccessRate, 60],
    [l.pdfColErrorRate, 60],
    [l.pdfColAvgDuration, 75],
    [l.pdfColToken, 75],
    [l.pdfColConversations, 75],
  ]
  const data = emps.map((e) => [
    e.name,
    `${e.totalTasks}`,
    `${e.successRate}%`,
    `${e.failureRate}%`,
    formatDuration(e.avgDurationMs, l),
    e.totalTokens.toLocaleString(),
    `${e.conversationCount}`,
  ])
  table(p, f, bf, cols, data, y, l.pdfNoEmployeeData)
}

function drawCostPage(
  p: PDFPage,
  f: PDFFont,
  bf: PDFFont,
  cost: CostData,
  l: (typeof messages)['zh-CN']['stats']
) {
  let y = sectionTitle(p, bf, l.pdfSectionCost, PAGE_H - MT)
  y = subTitle(p, bf, l.pdfSubByModel, y)
  const mc: [string, number][] = [
    [l.pdfColModel, 280],
    [l.pdfColToken, 215],
  ]
  y = table(
    p,
    f,
    bf,
    mc,
    cost.tokensByModel.filter((m) => m.tokens > 0).map((m) => [m.model, m.tokens.toLocaleString()]),
    y,
    l.pdfNoData
  )
  y -= 16
  if (y > MB + 80) {
    y = subTitle(p, bf, l.pdfSubByEmployee, y)
    const ec: [string, number][] = [
      [l.pdfColEmployee, 280],
      [l.pdfColToken, 215],
    ]
    y = table(
      p,
      f,
      bf,
      ec,
      cost.employeeTokens.map((e) => [e.name, e.tokens.toLocaleString()]),
      y,
      l.pdfNoData
    )
  }
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

async function _POST(request: NextRequest) {
  const body = await request.json()
  const {
    reportType,
    dateFrom,
    dateTo,
    locale: localeParam,
  } = body as { reportType: string; dateFrom: string; dateTo: string; locale?: string }
  const locale = resolveLocale(localeParam)
  const l = messages[locale].stats

  try {
    const auth = await requirePermission('employee:list')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    if (!reportType || !VALID_REPORT_TYPES.includes(reportType as ReportType)) {
      return apiErr('api.stat.reportTypeInvalid', { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return apiErr('api.stat.reportDateInvalid', { status: 400 })
    }
    if (dateFrom > dateTo) {
      return apiErr('api.stat.reportDateOrderInvalid', { status: 400 })
    }

    logger.info(`Generating ${reportType} report: ${dateFrom} to ${dateTo}`)

    const [overview, trends, employees, cost] = await Promise.all([
      fetchOverview(dateFrom, dateTo),
      fetchTrends(dateFrom, dateTo),
      fetchEmployees(dateFrom, dateTo, l.pdfUnknownEmployee),
      fetchCost(dateFrom, dateTo, l.pdfUnknownModel, l.pdfUnknown),
    ])

    const doc = await PDFDocument.create()
    const f = await loadFont(doc)
    const bf = await loadBoldFont(doc)
    const timeLocale = locale === 'zh-CN' ? 'zh-CN' : 'en-US'
    const gen = new Date().toLocaleString(timeLocale, { timeZone: 'Asia/Shanghai' })

    // Create all content pages first, trend pages may span multiple pages
    const allPages: PDFPage[] = []

    // 1. Cover page
    const p1 = doc.addPage([PAGE_W, PAGE_H])
    drawCover(p1, f, bf, reportType as ReportType, dateFrom, dateTo, gen, l)
    allPages.push(p1)

    // 2. Core metrics
    const p2 = doc.addPage([PAGE_W, PAGE_H])
    drawOverview(p2, f, bf, overview, l)
    allPages.push(p2)

    // 3. Trends (task count/success rate/error rate) — supports auto pagination
    const p3 = doc.addPage([PAGE_W, PAGE_H])
    const trendExtraPages = drawTrends(p3, doc, f, bf, trends, l)
    allPages.push(p3, ...trendExtraPages)

    // 4. Employee comparison
    const p4 = doc.addPage([PAGE_W, PAGE_H])
    drawEmployees(p4, f, bf, employees, l)
    allPages.push(p4)

    // 5. Call cost (model + employee)
    const p5 = doc.addPage([PAGE_W, PAGE_H])
    drawCostPage(p5, f, bf, cost, l)
    allPages.push(p5)

    // Add footers uniformly
    const footerText = l.pdfFooter
    const totalPages = allPages.length
    allPages.forEach((page, i) => footer(page, f, i + 1, totalPages, footerText))

    const bytes = await doc.save()
    const today = new Date().toISOString().split('T')[0]
    logger.info(`Report generated: ${bytes.length} bytes, ${totalPages} pages`)

    return new NextResponse(bytes.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="crewmeld-report-${today}.pdf"`,
        'Content-Length': String(bytes.length),
      },
    })
  } catch (error) {
    logger.error('Report generation failed', { error })
    return apiErr('api.stat.reportGenerateFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)

import { db } from '@crewmeld/db'
import { digitalEmployees, taskExecutions, workLogs } from '@crewmeld/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { resolveLocale } from '@/lib/i18n/server-locale'
import { t } from '@/lib/i18n/server-t'

/**
 * POST /api/employee/employees/[id]/logs/demo
 * Insert a batch of demo work logs for a specified employee, for demonstration purposes.
 *
 * Content is rendered in the caller's current locale at write time, so demo
 * entries match the language the user is operating in.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('employee:edit')
  if (!auth.authenticated || auth.error) {
    return apiAuthErr(auth)
  }

  const locale = resolveLocale(request)
  const { id: employeeId } = await params

  const [employee] = await db
    .select({ id: digitalEmployees.id, name: digitalEmployees.name })
    .from(digitalEmployees)
    .where(eq(digitalEmployees.id, employeeId))
    .limit(1)

  if (!employee) {
    return apiErr('api.employee.notFound', { status: 404 })
  }

  const now = Date.now()
  const minute = 60_000

  const userQuerySales = t('api.demo.userQuerySales', undefined, locale)
  const outputSales = t('api.demo.outputSales', undefined, locale)
  const userQueryOrders = t('api.demo.userQueryOrders', undefined, locale)
  const outputOrders = t('api.demo.outputOrders', undefined, locale)
  const userSubmitPurchase = t('api.demo.userSubmitPurchase', undefined, locale)
  const userSendEmail = t('api.demo.userSendEmail', undefined, locale)
  const errorEmailTimeout = t('api.demo.errorEmailTimeout', undefined, locale)

  // Demo task 1: Normal conversation reply (conversation trigger, succeeded)
  const task1Id = `task_${nanoid()}`
  await db.insert(taskExecutions).values({
    id: task1Id,
    employeeId,
    triggerType: 'conversation',
    status: 'success',
    input: { message: userQuerySales },
    inputSummary: userQuerySales,
    outputSummary: outputSales,
    tokensUsed: 1240,
    durationMs: 3200,
    startedAt: new Date(now - 8 * minute),
    completedAt: new Date(now - 8 * minute + 3200),
    createdAt: new Date(now - 8 * minute),
  })
  await db.insert(workLogs).values([
    {
      id: `log_${nanoid()}`,
      taskId: task1Id,
      employeeId,
      logType: 'llm_call',
      content: t('api.demo.logQwenCall', { tokens: 856 }, locale),
      metadata: { model: 'qwen-turbo', tokensInput: 620, tokensOutput: 236, round: 0 },
      createdAt: new Date(now - 8 * minute + 800),
    },
    {
      id: `log_${nanoid()}`,
      taskId: task1Id,
      employeeId,
      logType: 'action',
      content: t('api.demo.logChatReplied', undefined, locale),
      metadata: { conversationId: `conv_demo_1`, tokensUsed: 856 },
      createdAt: new Date(now - 8 * minute + 3200),
    },
  ])

  // Demo task 2: Tool call (query tool invoked, success)
  const task2Id = `task_${nanoid()}`
  await db.insert(taskExecutions).values({
    id: task2Id,
    employeeId,
    triggerType: 'conversation',
    status: 'success',
    input: { message: userQueryOrders },
    inputSummary: userQueryOrders,
    outputSummary: outputOrders,
    tokensUsed: 2180,
    durationMs: 5800,
    startedAt: new Date(now - 25 * minute),
    completedAt: new Date(now - 25 * minute + 5800),
    createdAt: new Date(now - 25 * minute),
  })
  await db.insert(workLogs).values([
    {
      id: `log_${nanoid()}`,
      taskId: task2Id,
      employeeId,
      logType: 'llm_call',
      content: t('api.demo.logQwenCall', { tokens: 920 }, locale),
      metadata: { model: 'qwen-turbo', tokensInput: 680, tokensOutput: 240, round: 0 },
      createdAt: new Date(now - 25 * minute + 1000),
    },
    {
      id: `log_${nanoid()}`,
      taskId: task2Id,
      employeeId,
      logType: 'tool_call',
      content: t('api.demo.logToolQueryOrders', undefined, locale),
      metadata: { toolName: 'query_orders', skillId: 'skill_crm_query' },
      createdAt: new Date(now - 25 * minute + 2500),
    },
    {
      id: `log_${nanoid()}`,
      taskId: task2Id,
      employeeId,
      logType: 'llm_call',
      content: t('api.demo.logQwenCall', { tokens: 1260 }, locale),
      metadata: { model: 'qwen-turbo', tokensInput: 980, tokensOutput: 280, round: 1 },
      createdAt: new Date(now - 25 * minute + 4200),
    },
    {
      id: `log_${nanoid()}`,
      taskId: task2Id,
      employeeId,
      logType: 'action',
      content: t('api.demo.logChatReplied', undefined, locale),
      metadata: { conversationId: `conv_demo_2`, tokensUsed: 2180 },
      createdAt: new Date(now - 25 * minute + 5800),
    },
  ])

  // Demo task 3: SOP workflow trigger (requires approval)
  const task3Id = `task_${nanoid()}`
  await db.insert(taskExecutions).values({
    id: task3Id,
    employeeId,
    triggerType: 'conversation',
    status: 'hitl_waiting',
    input: { message: userSubmitPurchase },
    inputSummary: userSubmitPurchase,
    requiresReview: true,
    tokensUsed: 1680,
    startedAt: new Date(now - 2 * 60 * minute),
    createdAt: new Date(now - 2 * 60 * minute),
  })
  await db.insert(workLogs).values([
    {
      id: `log_${nanoid()}`,
      taskId: task3Id,
      employeeId,
      logType: 'llm_call',
      content: t('api.demo.logQwenCall', { tokens: 840 }, locale),
      metadata: { model: 'qwen-turbo', tokensInput: 600, tokensOutput: 240, round: 0 },
      createdAt: new Date(now - 2 * 60 * minute + 1200),
    },
    {
      id: `log_${nanoid()}`,
      taskId: task3Id,
      employeeId,
      logType: 'action',
      content: t('api.demo.logTriggerWorkflow', undefined, locale),
      metadata: { workflowId: 'wf_purchase_apply', conversationId: 'conv_demo_3' },
      createdAt: new Date(now - 2 * 60 * minute + 2800),
    },
    {
      id: `log_${nanoid()}`,
      taskId: task3Id,
      employeeId,
      logType: 'decision',
      content: t('api.demo.logLobsterApprovalWait', undefined, locale),
      metadata: {
        pipeline: 'purchase_apply',
        approval: { description: t('api.demo.logApprovalDesc', { amount: 5000 }, locale) },
      },
      createdAt: new Date(now - 2 * 60 * minute + 4500),
    },
  ])

  // Demo task 4: Execution failed (tool call error)
  const task4Id = `task_${nanoid()}`
  await db.insert(taskExecutions).values({
    id: task4Id,
    employeeId,
    triggerType: 'conversation',
    status: 'failed',
    input: { message: userSendEmail },
    inputSummary: userSendEmail,
    errorMessage: errorEmailTimeout,
    tokensUsed: 760,
    durationMs: 12000,
    startedAt: new Date(now - 3 * 60 * minute),
    completedAt: new Date(now - 3 * 60 * minute + 12000),
    createdAt: new Date(now - 3 * 60 * minute),
  })
  await db.insert(workLogs).values([
    {
      id: `log_${nanoid()}`,
      taskId: task4Id,
      employeeId,
      logType: 'llm_call',
      content: t('api.demo.logQwenCall', { tokens: 760 }, locale),
      metadata: { model: 'qwen-turbo', tokensInput: 560, tokensOutput: 200, round: 0 },
      createdAt: new Date(now - 3 * 60 * minute + 1000),
    },
    {
      id: `log_${nanoid()}`,
      taskId: task4Id,
      employeeId,
      logType: 'error',
      content: t('api.demo.logToolEmailError', undefined, locale),
      metadata: { toolName: 'send_email', skillId: 'skill_email' },
      createdAt: new Date(now - 3 * 60 * minute + 11500),
    },
    {
      id: `log_${nanoid()}`,
      taskId: task4Id,
      employeeId,
      logType: 'error',
      content: t('api.demo.logChatFailed', undefined, locale),
      metadata: { conversationId: 'conv_demo_4' },
      createdAt: new Date(now - 3 * 60 * minute + 12000),
    },
  ])

  return apiOk(
    { taskIds: [task1Id, task2Id, task3Id, task4Id] },
    {
      message: 'api.employee.demoLogsGenerated',
      params: { name: employee.name, taskCount: 4, logCount: 12 },
    }
  )
}

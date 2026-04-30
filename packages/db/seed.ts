import { createLogger } from '@crewmeld/logger'
import { v4 as uuidv4 } from 'uuid'
import { db } from './index'
import { dailyStats, digitalEmployees, taskExecutions, workLogs } from './schema'

const logger = createLogger('Seed')

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function hoursAgo(n: number): Date {
  const d = new Date()
  d.setHours(d.getHours() - n)
  return d
}

async function seed() {
  logger.info('Starting seed data...')

  await db.delete(workLogs)
  await db.delete(dailyStats)
  await db.delete(taskExecutions)
  await db.delete(digitalEmployees)
  logger.info('Old data cleared')

  // ---- Digital employees ----
  const employeeIds = Array.from({ length: 6 }, () => uuidv4())
  const employeesData = [
    {
      id: employeeIds[0],
      name: 'CS Assistant',
      avatar: '/avatars/customer-service.png',
      description: 'Automatically answer common customer questions, available 24/7',
      blockType: 'agent',
      status: 'active' as const,
      config: { language: 'zh-CN', maxTokens: 2048, model: 'qwen-plus' },
      scheduleConfig: null,
      activatedAt: hoursAgo(720),
    },
    {
      id: employeeIds[1],
      name: 'Data Analyst',
      avatar: '/avatars/data-analyst.png',
      description: 'Automatically generate daily sales reports and push to WeCom',
      blockType: 'function',
      status: 'active' as const,
      config: { cronExpression: '0 9 * * 1-5', timezone: 'Asia/Shanghai' },
      scheduleConfig: { cron: '0 9 * * 1-5', timezone: 'Asia/Shanghai' },
      activatedAt: hoursAgo(360),
    },
    {
      id: employeeIds[2],
      name: 'Contract Reviewer',
      avatar: '/avatars/contract-reviewer.png',
      description:
        'Automatically review contract clauses, flag risk points and generate review opinions',
      blockType: 'agent',
      status: 'standby' as const,
      config: { reviewDepth: 'thorough', language: 'zh-CN' },
      scheduleConfig: null,
      activatedAt: null,
    },
    {
      id: employeeIds[3],
      name: 'Recruitment Screener',
      avatar: '/avatars/recruiter.png',
      description:
        'Automatically screen resumes, match job requirements and generate recommendation lists',
      blockType: 'function',
      status: 'active' as const,
      config: { matchThreshold: 0.75, topK: 10 },
      scheduleConfig: { cron: '0 8 * * 1-5', timezone: 'Asia/Shanghai' },
      activatedAt: hoursAgo(240),
    },
    {
      id: employeeIds[4],
      name: 'Content Creator',
      avatar: '/avatars/content-creator.png',
      description: 'Automatically generate marketing copy and social media content based on topics',
      blockType: 'agent',
      status: 'error' as const,
      config: { style: 'professional', maxLength: 5000 },
      scheduleConfig: null,
      activatedAt: hoursAgo(168),
    },
    {
      id: employeeIds[5],
      name: 'Ticket Handler',
      avatar: '/avatars/ticket-handler.png',
      description: 'Automatically classify tickets, assign handlers, and track progress',
      blockType: 'function',
      status: 'standby' as const,
      config: { autoAssign: true, priorityLevels: ['P0', 'P1', 'P2', 'P3'] },
      scheduleConfig: null,
      activatedAt: null,
    },
  ]
  await db.insert(digitalEmployees).values(employeesData)
  logger.info(`Inserted ${employeesData.length} digital employees`)

  // ---- Task execution records ----
  const taskIds: string[] = []
  const tasksData = []
  const statuses: Array<'success' | 'failed' | 'hitl_waiting' | 'running' | 'pending'> = [
    'success',
    'success',
    'success',
    'success',
    'success',
    'success',
    'success',
    'success',
    'success',
    'success',
    'success',
    'success',
    'failed',
    'failed',
    'failed',
    'hitl_waiting',
    'hitl_waiting',
    'running',
    'running',
    'pending',
  ]
  const triggers: Array<'scheduled' | 'manual' | 'event' | 'webhook' | 'api'> = [
    'scheduled',
    'manual',
    'event',
    'webhook',
    'api',
    'scheduled',
    'event',
    'manual',
    'scheduled',
    'manual',
    'webhook',
    'scheduled',
    'manual',
    'event',
    'scheduled',
    'api',
    'event',
    'scheduled',
    'manual',
    'event',
  ]

  for (let i = 0; i < 20; i++) {
    const taskId = uuidv4()
    taskIds.push(taskId)
    const empIndex = i % 6
    const hoursOffset = i * 3 + Math.floor(Math.random() * 3)
    const started = hoursAgo(hoursOffset)
    const durationMs = 1000 + Math.floor(Math.random() * 30000)
    const isCompleted = statuses[i] !== 'running' && statuses[i] !== 'pending'
    const completed = isCompleted ? new Date(started.getTime() + durationMs) : null
    const tokens = 500 + Math.floor(Math.random() * 10000)

    tasksData.push({
      id: taskId,
      employeeId: employeeIds[empIndex],
      workflowRunId: `wr-${uuidv4().slice(0, 8)}`,
      triggerType: triggers[i],
      status: statuses[i],
      input: { query: `Sample input #${i + 1}` },
      output: isCompleted ? { result: `Completed #${i + 1}` } : null,
      inputSummary: `User requests processing task #${i + 1}`,
      outputSummary: isCompleted ? `Task #${i + 1} completed` : null,
      tokensUsed: tokens,
      costRmb: (tokens * 0.002).toFixed(4),
      durationMs: isCompleted ? durationMs : null,
      errorMessage:
        statuses[i] === 'failed'
          ? `Task execution failed: timeout or insufficient resources (task #${i + 1})`
          : null,
      requiresReview: statuses[i] === 'hitl_waiting',
      reviewedBy: null,
      reviewedAt: null,
      startedAt: started,
      completedAt: completed,
    })
  }
  await db.insert(taskExecutions).values(tasksData)
  logger.info(`Inserted ${tasksData.length} task execution records`)

  // ---- Work logs ----
  const logTypes: Array<'action' | 'decision' | 'tool_call' | 'llm_call'> = [
    'action',
    'decision',
    'tool_call',
    'llm_call',
  ]
  const logsData = []
  for (let i = 0; i < 20; i++) {
    const logCount = 2 + Math.floor(Math.random() * 4)
    for (let j = 0; j < logCount; j++) {
      const logType =
        statuses[i] === 'failed' && j === logCount - 1 ? ('error' as const) : logTypes[j % 4]
      logsData.push({
        id: uuidv4(),
        taskId: taskIds[i],
        employeeId: employeeIds[i % 6],
        logType,
        content:
          logType === 'error'
            ? 'Execution error: encountered an error during processing'
            : `Step ${j + 1}: ${
                logType === 'action'
                  ? 'execute action'
                  : logType === 'decision'
                    ? 'make decision'
                    : logType === 'tool_call'
                      ? 'invoke tool'
                      : 'LLM inference'
              }`,
        metadata: {
          step: j + 1,
          duration: 100 + Math.floor(Math.random() * 5000),
        },
      })
    }
  }
  await db.insert(workLogs).values(logsData)
  logger.info(`Inserted ${logsData.length} work logs`)

  // ---- Daily statistics ----
  const statsData = []
  for (let day = 1; day <= 7; day++) {
    for (let emp = 0; emp < 6; emp++) {
      const completed = Math.floor(Math.random() * 30)
      const failed = Math.floor(Math.random() * 3)
      const pendingReview = Math.floor(Math.random() * 2)
      const tokens = completed * (500 + Math.floor(Math.random() * 2000))
      statsData.push({
        id: uuidv4(),
        employeeId: employeeIds[emp],
        statDate: daysAgo(day),
        totalTasks: completed + failed + pendingReview,
        successCount: completed,
        failureCount: failed,
        hitlCount: pendingReview,
        avgDurationMs: completed > 0 ? 2000 + Math.floor(Math.random() * 15000) : null,
        tokensConsumed: tokens,
        costRmb: (tokens * 0.002).toFixed(2),
        customMetrics: {},
      })
    }
  }
  await db.insert(dailyStats).values(statsData)
  logger.info(`Inserted ${statsData.length} daily stats`)

  logger.info('Seed data completed')
  logger.info(`  Digital employees: ${employeesData.length}`)
  logger.info(`  Task executions: ${tasksData.length}`)
  logger.info(`  Work logs: ${logsData.length}`)
  logger.info(`  Daily stats: ${statsData.length}`)
  process.exit(0)
}

seed().catch((err) => {
  logger.error('Seed data failed', err)
  process.exit(1)
})

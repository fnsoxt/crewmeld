import type { APIRequestContext } from '@playwright/test'

/** Prefix for all test-created employees — easy to identify for cleanup */
const TEST_PREFIX = 'E2E测试员工'

/** Status distribution for 15 employees (exceeds one screen in 3-col grid) */
const EMPLOYEE_SPECS: Array<{
  suffix: string
  description: string
  statusAfterCreate?: 'active' | 'paused'
}> = [
  { suffix: '客服A', description: '自动回复常见问题' },
  { suffix: '客服B', description: '处理售后工单' },
  { suffix: '分析师', description: '每日生成数据报表', statusAfterCreate: 'active' },
  { suffix: '审核员', description: '合同条款自动审核', statusAfterCreate: 'active' },
  { suffix: '招聘官', description: '简历筛选与匹配', statusAfterCreate: 'active' },
  { suffix: '创作者', description: '营销文案自动生成', statusAfterCreate: 'paused' },
  { suffix: '翻译官', description: '多语言文档翻译' },
  { suffix: '质检员', description: '产品质量检测报告', statusAfterCreate: 'paused' },
  { suffix: '调度员', description: '资源智能调度' },
  { suffix: '培训师', description: '员工培训内容推荐', statusAfterCreate: 'active' },
  { suffix: '风控员', description: '交易风险实时监控', statusAfterCreate: 'active' },
  { suffix: '运维工', description: '服务器状态监控告警' },
  { suffix: '文档员', description: '会议纪要自动整理', statusAfterCreate: 'paused' },
  { suffix: '采购员', description: '供应商价格对比分析' },
  { suffix: '巡检员', description: '设备巡检记录生成' },
]

export interface TestDataContext {
  templateId: string
  employeeIds: string[]
  /** IDs of employees that were set to 'active' (need PATCH before DELETE) */
  activeIds: string[]
}

/**
 * Creates 15 test employees via API.
 * Returns IDs for cleanup. All employees start as 'standby', then some are
 * promoted to 'active' or 'paused' to give a realistic status distribution.
 *
 * Also cleans up any orphaned test employees from previous failed runs.
 */
export async function setupTestData(request: APIRequestContext): Promise<TestDataContext> {
  // 1. Fetch available templates
  const tplRes = await request.get('/api/employee/templates')
  const tplJson = await tplRes.json()
  if (!tplJson.success || !tplJson.data?.length) {
    throw new Error('No templates available — cannot create test employees')
  }
  const templateId: string = tplJson.data[0].id

  // 2. Create employees
  const employeeIds: string[] = []
  const activeIds: string[] = []

  for (const spec of EMPLOYEE_SPECS) {
    const createRes = await request.post('/api/employee/employees', {
      data: {
        templateId,
        name: `${TEST_PREFIX}-${spec.suffix}`,
        description: spec.description,
      },
    })
    const createJson = await createRes.json()
    if (!createJson.success) {
      throw new Error(`Failed to create employee "${spec.suffix}": ${createJson.error}`)
    }
    const id: string = createJson.data.id
    employeeIds.push(id)

    // 3. Update status if needed
    if (spec.statusAfterCreate) {
      await request.patch(`/api/employee/employees/${id}/status`, {
        data: { status: spec.statusAfterCreate },
      })
      if (spec.statusAfterCreate === 'active') {
        activeIds.push(id)
      }
    }
  }

  return { templateId, employeeIds, activeIds }
}

/**
 * Removes orphaned test employees (from previous failed runs) by searching
 * for the TEST_PREFIX in the employee list and deleting any matches.
 */
async function cleanupOrphans(request: APIRequestContext): Promise<void> {
  const res = await request.get(`/api/employee/employees?search=${encodeURIComponent(TEST_PREFIX)}`)
  if (!res.ok()) return
  const json = await res.json()
  const orphans: Array<{ id: string; status: string }> = json.data ?? []
  for (const emp of orphans) {
    if (emp.status === 'active') {
      await request
        .patch(`/api/employee/employees/${emp.id}/status`, {
          data: { status: 'standby' },
        })
        .catch(() => {})
    }
    await request.delete(`/api/employee/employees/${emp.id}`).catch(() => {})
  }
}

/**
 * Deletes all test-created employees.
 * Active employees are first demoted to 'standby' (DELETE rejects active).
 * CASCADE on digital_employees handles all child records.
 */
export async function teardownTestData(
  request: APIRequestContext,
  ctx: TestDataContext
): Promise<void> {
  // 1. Demote active employees to standby
  for (const id of ctx.activeIds) {
    await request
      .patch(`/api/employee/employees/${id}/status`, {
        data: { status: 'standby' },
      })
      .catch(() => {})
  }

  // 2. Delete all employees (CASCADE handles bindings, tasks, stats, logs)
  for (const id of ctx.employeeIds) {
    await request.delete(`/api/employee/employees/${id}`).catch(() => {})
  }

  // 3. Clean up orphans from previous failed runs
  await cleanupOrphans(request)
}

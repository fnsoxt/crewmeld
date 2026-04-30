export type WizardMode = 'single' | 'team'

export interface EmployeeConfig {
  name: string
  description: string
  avatar: string
  persona: string
}

export interface CreatedEmployee {
  id: string
  name: string
  blockType: string
}

export interface WizardState {
  currentStep: number
  mode: WizardMode
  selectedRoleId: string | null
  selectedRoleName: string | null
  teamName: string
  employeeConfig: EmployeeConfig
  selectedKBIds: string[]
  createdEmployeeId: string | null
  createdEmployeeIds: string[]
  testRunResult: TestRunResult | null
}

export interface CreateEmployeeRequest {
  roleId?: string
  name: string
  description?: string
  avatar?: string
  config?: Record<string, unknown>
}

export interface CreateEmployeeResponse {
  success: boolean
  data: {
    id: string
    name: string
    status: string
    createdAt: string
  }
}

export interface TestRunResult {
  executionId: string
  status: 'success' | 'failed'
  output: Record<string, unknown>
  logs: TestRunLog[]
  duration: number
}

export interface TestRunLog {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
}

/** Translation keys for wizard step labels — resolve via t() in components */
export const STEP_LABEL_KEYS = [
  'employees.wizardStepBasic',
  'employees.wizardStepSystems',
  'employees.wizardStepKnowledge',
  'employees.wizardStepModel',
  'employees.wizardStepTest',
] as const

/** @deprecated Use STEP_LABEL_KEYS + useTranslation() instead */
export const STEP_LABELS = STEP_LABEL_KEYS

export const DEFAULT_AVATARS = ['🤖', '👨‍💼', '👩‍💼', '🧑‍💻', '📊', '💼', '🎯', '📈'] as const

/** Translation keys for avatar category labels — resolve via t() in components */
export const AVATAR_CATEGORY_KEYS = [
  'employees.avatarCategoryPeople',
  'employees.avatarCategoryRobot',
  'employees.avatarCategoryBusiness',
  'employees.avatarCategoryData',
  'employees.avatarCategoryTools',
  'employees.avatarCategoryCreative',
  'employees.avatarCategoryCommunication',
  'employees.avatarCategoryOther',
] as const

export const AVATAR_CATEGORIES: {
  labelKey: string
  label?: string
  icon: string
  emojis: string[]
}[] = [
  {
    labelKey: 'employees.avatarCategoryPeople',
    icon: '👤',
    emojis: [
      '👨‍💼',
      '👩‍💼',
      '🧑‍💻',
      '👨‍🔬',
      '👩‍🔬',
      '👨‍🏫',
      '👩‍🏫',
      '👨‍⚕️',
      '👩‍⚕️',
      '👨‍🎨',
      '👩‍🎨',
      '👷',
      '💂',
      '🕵️',
      '🧑‍🍳',
      '🧑‍✈️',
    ],
  },
  {
    labelKey: 'employees.avatarCategoryRobot',
    icon: '🤖',
    emojis: [
      '🤖',
      '🦾',
      '🦿',
      '⚙️',
      '🔩',
      '🧲',
      '💡',
      '🔮',
      '🧿',
      '🪄',
      '🛸',
      '👾',
      '🎮',
      '🕹️',
      '📡',
      '🛰️',
    ],
  },
  {
    labelKey: 'employees.avatarCategoryBusiness',
    icon: '💼',
    emojis: [
      '💼',
      '👔',
      '🏢',
      '🏦',
      '💰',
      '💳',
      '📋',
      '📌',
      '📎',
      '🗂️',
      '📁',
      '🗄️',
      '💵',
      '🪙',
      '📊',
      '📈',
    ],
  },
  {
    labelKey: 'employees.avatarCategoryData',
    icon: '📊',
    emojis: [
      '📊',
      '📈',
      '📉',
      '🔢',
      '🧮',
      '📐',
      '📏',
      '🔬',
      '🧪',
      '🧬',
      '💹',
      '🗃️',
      '💾',
      '💿',
      '🖥️',
      '⌨️',
    ],
  },
  {
    labelKey: 'employees.avatarCategoryTools',
    icon: '🛠️',
    emojis: [
      '🛠️',
      '🔧',
      '🔨',
      '⛏️',
      '🪛',
      '🪚',
      '🔩',
      '⚙️',
      '🧰',
      '🪤',
      '🔗',
      '🧱',
      '🪝',
      '📐',
      '📏',
      '✂️',
    ],
  },
  {
    labelKey: 'employees.avatarCategoryCreative',
    icon: '🎨',
    emojis: [
      '🎨',
      '🖌️',
      '✏️',
      '🖊️',
      '🖋️',
      '📝',
      '📓',
      '📒',
      '🎭',
      '🎬',
      '📸',
      '🎵',
      '🎶',
      '🎹',
      '🎷',
      '🎸',
    ],
  },
  {
    labelKey: 'employees.avatarCategoryCommunication',
    icon: '🌐',
    emojis: [
      '🌐',
      '📧',
      '📨',
      '📩',
      '💬',
      '💭',
      '📢',
      '📣',
      '📱',
      '📲',
      '☎️',
      '📞',
      '📡',
      '🔔',
      '🔊',
      '✉️',
    ],
  },
  {
    labelKey: 'employees.avatarCategoryOther',
    icon: '🎲',
    emojis: [
      '🎯',
      '🏆',
      '⭐',
      '🌟',
      '💎',
      '👑',
      '🔥',
      '⚡',
      '🌈',
      '🍀',
      '🎪',
      '🧩',
      '♟️',
      '🎲',
      '🪁',
      '🏅',
    ],
  },
]

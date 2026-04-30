'use client'

import { useCallback, useMemo, useState } from 'react'
import { createLogger } from '@crewmeld/logger'
import type { PlatformRole } from '@/lib/auth/rbac/types'
import { useTranslation } from '@/hooks/use-translation'
import type { PermissionDef } from '../hooks/use-role-permissions'

const logger = createLogger('PermissionMatrix')

interface PermissionMatrixProps {
  permissions: PermissionDef[]
  rolePermissions: Record<string, string[]>
  onSaved: () => void
}

/** Editable roles (super_admin has all permissions by default, no config needed) */
const EDITABLE_ROLES: PlatformRole[] = ['admin', 'member']

/** Categories not shown in the matrix (only operable by super admin) */
const HIDDEN_CATEGORIES = new Set(['role'])

/**
 * Group permissions by left sidebar menu
 * key = menu i18n key, categories = Permission categories for this menu
 * listCode = The "view list" permission for this group (auto-linked anchor)
 */
interface MenuGroup {
  labelKey: string
  categories: string[]
  listCode?: string // view-list permission code; auto-checked when a write permission is checked
}

const MENU_GROUPS: MenuGroup[] = [
  { labelKey: 'nav.employees', categories: ['employee'], listCode: 'employee:list' },
  { labelKey: 'nav.tasks', categories: ['task'], listCode: 'task:list' },
  { labelKey: 'nav.knowledge', categories: ['knowledge'], listCode: 'knowledge:list' },
  { labelKey: 'nav.connections', categories: ['connector'], listCode: 'connector:list' },
  { labelKey: 'nav.channels', categories: ['channel'], listCode: 'channel:list' },
  { labelKey: 'nav.sops', categories: ['sop'], listCode: 'sop:list' },
  { labelKey: 'nav.skills', categories: ['skill'], listCode: 'skill:list' },
  { labelKey: 'settings.tabUsers', categories: ['user'], listCode: 'user:list' },
  {
    labelKey: 'settings.tabRegistration',
    categories: ['registration'],
    listCode: 'registration:view',
  },
  { labelKey: 'settings.tabSystemInfo', categories: ['system'], listCode: 'system:view' },
  { labelKey: 'nav.stats', categories: ['model'], listCode: 'model:list' },
  {
    labelKey: 'settings.permCategoryTemplate',
    categories: ['template'],
    listCode: 'template:list',
  },
]

export function PermissionMatrix({ permissions, rolePermissions, onSaved }: PermissionMatrixProps) {
  const { t } = useTranslation()

  const ROLE_LABELS: Record<PlatformRole, string> = {
    super_admin: t('settings.roleLabelSuperAdmin'),
    admin: t('settings.roleLabelAdmin'),
    member: t('settings.roleLabelMember'),
  }

  // Local edit state: role -> Set<permissionCode>
  const [editState, setEditState] = useState<Record<string, Set<string>>>(() => {
    const state: Record<string, Set<string>> = {}
    for (const role of EDITABLE_ROLES) {
      state[role] = new Set(rolePermissions[role] ?? [])
    }
    return state
  })

  const [savingRole, setSavingRole] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Group by menu: collect permissions under each MenuGroup
  const menuGrouped = useMemo(() => {
    const catMap = new Map<string, PermissionDef[]>()
    for (const perm of permissions) {
      if (HIDDEN_CATEGORIES.has(perm.category)) continue
      const list = catMap.get(perm.category) ?? []
      list.push(perm)
      catMap.set(perm.category, list)
    }

    return MENU_GROUPS.map((group) => {
      const perms: PermissionDef[] = []
      for (const cat of group.categories) {
        perms.push(...(catMap.get(cat) ?? []))
      }
      return { ...group, perms }
    }).filter((g) => g.perms.length > 0)
  }, [permissions])

  // Total visible permissions (excluding hidden categories)
  const visiblePermCount = useMemo(
    () => permissions.filter((p) => !HIDDEN_CATEGORIES.has(p.category)).length,
    [permissions]
  )

  /**
   * Toggle a single permission with auto-linking:
   * - Checking write permission -> auto-check listCode
   * - Unchecking listCode -> auto-uncheck all permissions in group
   */
  const togglePermission = useCallback(
    (role: string, code: string, group: MenuGroup) => {
      setEditState((prev) => {
        const next = { ...prev }
        const set = new Set(prev[role])

        if (set.has(code)) {
          // Uncheck
          set.delete(code)
          // Unchecking listCode -> uncheck all in group
          if (code === group.listCode) {
            for (const cat of group.categories) {
              for (const p of permissions) {
                if (p.category === cat) set.delete(p.code)
              }
            }
          }
        } else {
          // Check
          set.add(code)
          // Checking write permission -> auto-check listCode
          if (code !== group.listCode && group.listCode) {
            set.add(group.listCode)
          }
        }

        next[role] = set
        return next
      })
      setMessage(null)
    },
    [permissions]
  )

  const toggleGroupAll = useCallback((role: string, group: MenuGroup, perms: PermissionDef[]) => {
    setEditState((prev) => {
      const next = { ...prev }
      const set = new Set(prev[role])
      const allSelected = perms.every((p) => set.has(p.code))
      for (const p of perms) {
        if (allSelected) {
          set.delete(p.code)
        } else {
          set.add(p.code)
        }
      }
      next[role] = set
      return next
    })
    setMessage(null)
  }, [])

  const handleSave = async (role: string) => {
    try {
      setSavingRole(role)
      setMessage(null)
      const codes = Array.from(editState[role])
      const res = await fetch(`/api/employee/settings/roles/${role}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionCodes: codes }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: t('settings.rolesSaved') })
        setTimeout(() => setMessage(null), 3000)
        onSaved()
      } else {
        setMessage({ type: 'error', text: data.error ?? t('settings.rolesSaveFailed') })
        setTimeout(() => setMessage(null), 3000)
      }
    } catch (err) {
      logger.error('Save role permissions failed', { error: err })
      setMessage({ type: 'error', text: t('settings.rolesSaveFailed') })
      setTimeout(() => setMessage(null), 3000)
    } finally {
      setSavingRole(null)
    }
  }

  const handleReset = (role: string) => {
    setEditState((prev) => ({
      ...prev,
      [role]: new Set(rolePermissions[role] ?? []),
    }))
    setMessage(null)
  }

  const hasChanges = (role: string) => {
    const original = new Set(rolePermissions[role] ?? [])
    const current = editState[role]
    if (original.size !== current.size) return true
    for (const code of original) {
      if (!current.has(code)) return true
    }
    return false
  }

  // Currently expanded role
  const [expandedRole, setExpandedRole] = useState<string | null>(null)

  return (
    <div className='space-y-3'>
      {/* Floating toast notification */}
      {message && (
        <div
          className={`-translate-x-1/2 fixed top-16 left-1/2 z-50 rounded-xl border px-5 py-3 shadow-lg transition-opacity ${
            message.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          <span className='font-medium text-sm'>{message.text}</span>
        </div>
      )}

      {EDITABLE_ROLES.map((role) => {
        const permCount = editState[role].size
        const changed = hasChanges(role)
        const isExpanded = expandedRole === role

        return (
          <div key={role} className='rounded-xl border border-gray-200 bg-white'>
            {/* Role header - click to expand/collapse */}
            <div className='flex w-full items-center justify-between px-6 py-4'>
              <div
                className='flex flex-1 cursor-pointer items-center gap-3'
                onClick={() => setExpandedRole((prev) => (prev === role ? null : role))}
              >
                <svg
                  className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                  viewBox='0 0 16 16'
                  fill='none'
                >
                  <path
                    d='M6 4l4 4-4 4'
                    stroke='currentColor'
                    strokeWidth='1.5'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                  />
                </svg>
                <div>
                  <h3 className='font-semibold text-gray-900 text-sm'>{ROLE_LABELS[role]}</h3>
                  <p className='mt-0.5 text-gray-400 text-xs'>
                    {permCount} / {visiblePermCount}{' '}
                    {t('settings.rolesPermCount').replace('{count}', '')}
                  </p>
                </div>
              </div>
              <div className='flex items-center gap-2'>
                {changed && (
                  <button
                    type='button'
                    onClick={() => handleReset(role)}
                    className='rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-600 text-xs hover:bg-gray-50'
                  >
                    {t('settings.rolesResetBtn')}
                  </button>
                )}
                <button
                  type='button'
                  disabled={!changed || savingRole === role}
                  onClick={() => handleSave(role)}
                  className='rounded-lg bg-blue-600 px-4 py-1.5 font-medium text-white text-xs hover:bg-blue-700 disabled:opacity-50'
                >
                  {savingRole === role ? t('settings.rolesSaving') : t('settings.rolesSaveBtn')}
                </button>
              </div>
            </div>

            {/* Permission list grouped by menu */}
            {isExpanded && (
              <div className='divide-y divide-gray-50 border-gray-100 border-t px-6'>
                {menuGrouped.map((group) => {
                  const { perms } = group
                  const allSelected = perms.every((p) => editState[role].has(p.code))
                  const someSelected = perms.some((p) => editState[role].has(p.code))
                  const menuLabel = t(group.labelKey as Parameters<typeof t>[0])

                  return (
                    <div key={group.labelKey} className='py-3'>
                      {/* Menu name + select all */}
                      <div className='mb-2 flex items-center gap-2'>
                        <button
                          type='button'
                          onClick={() => toggleGroupAll(role, group, perms)}
                          className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                            allSelected
                              ? 'border-blue-600 bg-blue-600'
                              : someSelected
                                ? 'border-blue-400 bg-blue-100'
                                : 'border-gray-300 bg-white'
                          }`}
                        >
                          {allSelected && (
                            <svg className='h-3 w-3 text-white' viewBox='0 0 12 12' fill='none'>
                              <path
                                d='M2.5 6l2.5 2.5 4.5-5'
                                stroke='currentColor'
                                strokeWidth='1.5'
                                strokeLinecap='round'
                                strokeLinejoin='round'
                              />
                            </svg>
                          )}
                          {!allSelected && someSelected && (
                            <div className='h-1.5 w-1.5 rounded-sm bg-blue-600' />
                          )}
                        </button>
                        <span className='font-semibold text-gray-700 text-xs'>{menuLabel}</span>
                        <span className='text-gray-300 text-xs'>
                          {perms.filter((p) => editState[role].has(p.code)).length}/{perms.length}
                        </span>
                      </div>

                      {/* Permission items */}
                      <div className='ml-6 flex flex-wrap gap-x-6 gap-y-1.5'>
                        {perms.map((perm) => {
                          const checked = editState[role].has(perm.code)
                          const codeKey = perm.code.replace(':', '_')
                          const nameKey = `settings.permName_${codeKey}` as Parameters<typeof t>[0]
                          const descKey = `settings.permDesc_${codeKey}` as Parameters<typeof t>[0]
                          const permName = t(nameKey) !== nameKey ? t(nameKey) : perm.name
                          const permDesc =
                            t(descKey) !== descKey ? t(descKey) : (perm.description ?? '')
                          const isListPerm = perm.code === group.listCode
                          return (
                            <label
                              key={perm.code}
                              className='flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-gray-50'
                            >
                              <input
                                type='checkbox'
                                checked={checked}
                                onChange={() => togglePermission(role, perm.code, group)}
                                className='h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                              />
                              <span
                                className={`text-sm ${isListPerm ? 'font-medium text-gray-900' : 'text-gray-700'}`}
                                title={permDesc}
                              >
                                {permName}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

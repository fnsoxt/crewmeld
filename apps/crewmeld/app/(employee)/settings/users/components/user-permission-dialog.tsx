'use client'

import { useEffect, useState } from 'react'
import type { PlatformRole } from '@/lib/auth/rbac/types'
import { useTranslation } from '@/hooks/use-translation'

interface PermissionItem {
  code: string
  name: string
  description: string | null
  category: string
}

/** Permission category -> i18n key mapping */
const CATEGORY_I18N: Record<string, string> = {
  user: 'settings.permCategoryUser',
  role: 'settings.permCategoryRole',
  registration: 'settings.permCategoryRegistration',
  employee: 'settings.permCategoryEmployee',
  connector: 'settings.permCategoryConnector',
  skill: 'settings.permCategorySkill',
  model: 'settings.permCategoryModel',
  system: 'settings.permCategorySystem',
  task: 'settings.permCategoryTask',
  template: 'settings.permCategoryTemplate',
  knowledge: 'settings.permCategoryKnowledge',
  channel: 'settings.permCategoryChannel',
  sop: 'settings.permCategorySop',
}

interface UserPermissionDialogProps {
  userName: string
  userRole: PlatformRole
  onClose: () => void
}

export function UserPermissionDialog({ userName, userRole, onClose }: UserPermissionDialogProps) {
  const { t } = useTranslation()
  const [allPermissions, setAllPermissions] = useState<PermissionItem[]>([])
  const [userPermCodes, setUserPermCodes] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)

  const ROLE_LABELS: Record<PlatformRole, string> = {
    super_admin: t('settings.roleLabelSuperAdmin'),
    admin: t('settings.roleLabelAdmin'),
    member: t('settings.roleLabelMember'),
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/employee/settings/roles')
        const json = await res.json()
        if (json.success) {
          setAllPermissions(json.data.permissions)
          setUserPermCodes(new Set(json.data.rolePermissions[userRole] ?? []))
        }
      } catch {
        // non-fatal
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [userRole])

  // Group by category
  const grouped = new Map<string, PermissionItem[]>()
  for (const perm of allPermissions) {
    const list = grouped.get(perm.category) ?? []
    list.push(perm)
    grouped.set(perm.category, list)
  }

  const descText = t('settings.viewPermissionsDesc')
    .replace('{name}', userName)
    .replace('{role}', ROLE_LABELS[userRole])

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/40'
      onClick={onClose}
    >
      <div
        className='mx-4 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='border-gray-100 border-b px-6 py-4'>
          <h2 className='font-semibold text-gray-900 text-lg'>
            {t('settings.viewPermissionsTitle')}
          </h2>
          <p className='mt-1 text-gray-500 text-sm'>{descText}</p>
        </div>

        <div className='px-6 py-4'>
          {isLoading ? (
            <div className='space-y-3'>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className='h-6 animate-pulse rounded bg-gray-100' />
              ))}
            </div>
          ) : (
            <div className='space-y-4'>
              {Array.from(grouped.entries()).map(([category, perms]) => {
                const categoryLabel = CATEGORY_I18N[category]
                  ? t(CATEGORY_I18N[category] as Parameters<typeof t>[0])
                  : category

                return (
                  <div key={category}>
                    <h4 className='mb-1.5 font-semibold text-gray-400 text-xs uppercase tracking-wide'>
                      {categoryLabel}
                    </h4>
                    <div className='space-y-1'>
                      {perms.map((perm) => {
                        const has = userPermCodes.has(perm.code)
                        const codeKey = perm.code.replace(':', '_')
                        const nameKey = `settings.permName_${codeKey}` as Parameters<typeof t>[0]
                        const permName = t(nameKey) !== nameKey ? t(nameKey) : perm.name
                        return (
                          <div
                            key={perm.code}
                            className='flex items-center justify-between rounded px-2 py-1'
                          >
                            <span className='text-gray-700 text-sm'>{permName}</span>
                            {has ? (
                              <span className='inline-flex items-center gap-1 font-medium text-green-600 text-xs'>
                                <svg className='h-3.5 w-3.5' viewBox='0 0 16 16' fill='none'>
                                  <path
                                    d='M4 8l3 3 5-5'
                                    stroke='currentColor'
                                    strokeWidth='2'
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                  />
                                </svg>
                                {t('settings.permissionEnabled')}
                              </span>
                            ) : (
                              <span className='font-medium text-gray-300 text-xs'>
                                {t('settings.permissionDisabled')}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className='border-gray-100 border-t px-6 py-3 text-right'>
          <button
            type='button'
            onClick={onClose}
            className='rounded-lg border border-gray-200 px-4 py-2 font-medium text-gray-600 text-sm hover:bg-gray-50'
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}

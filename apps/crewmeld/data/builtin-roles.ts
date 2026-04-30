/**
 * Built-in digital employee roles — frontend static data source.
 *
 * Mirrors the old project's `data/builtin-templates.ts`, but flattened to
 * single-role records to match the new project's first-class `roles` model.
 *
 * Built-in roles are not stored in the database. The wizard merges them with
 * the user's custom roles for display, and the employee POST handler
 * resolves the static record (instead of a DB lookup) when it sees a
 * `builtin-` ID.
 */

import type { FlatRole } from '@/lib/types/role'
import type { Locale } from '@/locales'
import { getBuiltinRoleTranslations } from '@/locales/builtin-roles'
import dataData from './builtin-roles/data.json'
import salesData from './builtin-roles/sales.json'
import serviceData from './builtin-roles/service.json'

/** Built-in role record (English source data) */
export interface BuiltinRole {
  id: string
  name: string
  description: string
  persona: string
  blockType: string
  category: string
  icon: string | null
}

interface BuiltinRoleFile {
  category: string
  roles: Array<{
    id: string
    name: string
    description: string
    persona: string
    blockType: string
    icon?: string | null
  }>
}

function expand(file: BuiltinRoleFile): BuiltinRole[] {
  return file.roles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    persona: r.persona,
    blockType: r.blockType,
    category: file.category,
    icon: r.icon ?? null,
  }))
}

/** All built-in roles — English source (flat list across categories) */
export const BUILTIN_ROLES: BuiltinRole[] = [
  ...expand(salesData as BuiltinRoleFile),
  ...expand(dataData as BuiltinRoleFile),
  ...expand(serviceData as BuiltinRoleFile),
]

const BUILTIN_ROLE_IDS = new Set(BUILTIN_ROLES.map((r) => r.id))
const BUILTIN_ID_PREFIX = 'builtin-'

/**
 * Cheap prefix check for any code path that needs to branch on whether a
 * given role ID belongs to a built-in (e.g. backend resolution, delete
 * protection). Falls back to the explicit set for safety.
 */
export function isBuiltinRoleId(id: string | null | undefined): boolean {
  if (typeof id !== 'string') return false
  return id.startsWith(BUILTIN_ID_PREFIX) || BUILTIN_ROLE_IDS.has(id)
}

/** Look up a built-in role by id (English source). Returns undefined if not found. */
export function getBuiltinRole(id: string): BuiltinRole | undefined {
  return BUILTIN_ROLES.find((r) => r.id === id)
}

/**
 * Returns built-in roles localised for the given locale.
 * For English (source locale) returns the JSON values as-is.
 */
export function getLocalizedBuiltinRoles(locale: Locale): FlatRole[] {
  const overlay = getBuiltinRoleTranslations(locale)
  return BUILTIN_ROLES.map((r) => {
    const tr = overlay?.[r.id]
    return {
      id: r.id,
      name: tr?.name ?? r.name,
      description: tr?.description ?? r.description,
      persona: tr?.persona ?? r.persona,
      blockType: r.blockType,
      category: r.category,
      icon: r.icon,
    }
  })
}

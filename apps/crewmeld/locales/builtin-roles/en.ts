/**
 * English source language type definition for built-in role overlays.
 *
 * English text lives directly inside the JSON files under
 * `data/builtin-roles/`, so no overlay is needed — this module only
 * exports the shared overlay type.
 */

export interface BuiltinRoleTranslation {
  name: string
  description: string
  persona: string
}

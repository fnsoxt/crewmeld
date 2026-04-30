import { z } from 'zod'
import { isInternalFileUrl } from '@/lib/uploads/utils/file-utils'

// ─── internal helpers ────────────────────────────────────────────────────────

/** Return `true` when `value` looks like a URL or absolute path. */
const looksLikeUrl = (value: string): boolean =>
  value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')

// ─── schema definitions ──────────────────────────────────────────────────────

/**
 * Schema for a single raw file input object.
 *
 * Enforces three rules beyond basic shape:
 * 1. At least one of `key`, `path`, or `url` must be present.
 * 2. When only `url` is provided, it must reference an uploaded file.
 * 3. When only `path` is provided as a URL-like string, it must reference an
 *    uploaded file (not an arbitrary external URL).
 */
export const RawFileInputSchema = z
  .object({
    id: z.string().optional(),
    key: z.string().optional(),
    path: z.string().optional(),
    url: z.string().optional(),
    name: z.string().min(1),
    size: z.number().nonnegative(),
    type: z.string().optional(),
    uploadedAt: z.union([z.string(), z.date()]).optional(),
    expiresAt: z.union([z.string(), z.date()]).optional(),
    context: z.string().optional(),
    base64: z.string().optional(),
  })
  .passthrough()
  // Rule 1: must have a locatable reference
  .refine((data) => Boolean(data.key || data.path || data.url), {
    message: 'File must include key, path, or url',
  })
  // Rule 2: url-only must be an internal serve URL
  .refine(
    (data) => {
      if (data.key || data.path || !data.url) return true
      return isInternalFileUrl(data.url)
    },
    { message: 'File url must reference an uploaded file' }
  )
  // Rule 3: path-only URL-like strings must be internal serve URLs
  .refine(
    (data) => {
      if (data.key || !data.path) return true
      if (!looksLikeUrl(data.path)) return true
      return isInternalFileUrl(data.path)
    },
    { message: 'File path must reference an uploaded file' }
  )

/** Schema for an array of raw file inputs. */
export const RawFileInputArraySchema = z.array(RawFileInputSchema)

/** Schema that accepts either a raw file input object or a plain string path/URL. */
export const FileInputSchema = z.union([RawFileInputSchema, z.string()])

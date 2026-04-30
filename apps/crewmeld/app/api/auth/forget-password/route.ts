import { createLogger } from '@crewmeld/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { isSameOrigin } from '@/lib/core/utils/validation'

export const dynamic = 'force-dynamic'

const logger = createLogger('ForgetPasswordAPI')

/** Validate the redirect URL: must be a valid absolute URL on the same origin, or absent. */
const sameOriginUrlSchema = z
  .string()
  .optional()
  .or(z.literal(''))
  .transform((val) => (val === '' || val === undefined ? undefined : val))
  .refine(
    (val) => val === undefined || (z.string().url().safeParse(val).success && isSameOrigin(val)),
    { message: 'Redirect URL must be a valid same-origin URL' }
  )

const requestSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Please provide a valid email address'),
  redirectTo: sameOriginUrlSchema,
})

/** Initiate a password-reset flow via better-auth. */
export async function POST(request: NextRequest) {
  let email: string
  let redirectTo: string | undefined

  try {
    const body = await request.json()
    const parsed = requestSchema.safeParse(body)

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]
      logger.warn('Invalid forget-password request', { errors: parsed.error.format() })
      return NextResponse.json(
        { message: firstError?.message ?? 'Invalid request data' },
        { status: 400 }
      )
    }

    ;({ email, redirectTo } = parsed.data)
  } catch {
    return NextResponse.json({ message: 'Invalid request body' }, { status: 400 })
  }

  try {
    await auth.api.forgetPassword({
      body: { email, redirectTo },
      method: 'POST',
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('Error requesting password reset', { error: err })
    const message =
      err instanceof Error
        ? err.message
        : 'Failed to send password reset email. Please try again later.'
    return NextResponse.json({ message }, { status: 500 })
  }
}

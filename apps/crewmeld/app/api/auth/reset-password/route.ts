import { createLogger } from '@crewmeld/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const logger = createLogger('PasswordResetAPI')

/** Compound password rules applied in order for clear first-error messaging. */
const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters long')
  .max(100, 'Password must not exceed 100 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')

const resetSchema = z.object({
  token: z.string({ required_error: 'Token is required' }).min(1, 'Token is required'),
  newPassword: passwordSchema,
})

/** Consume a password-reset token and set a new password via better-auth. */
export async function POST(request: NextRequest) {
  let token: string
  let newPassword: string

  try {
    const body = await request.json()
    const parsed = resetSchema.safeParse(body)

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]
      logger.warn('Invalid password reset request data', { errors: parsed.error.format() })
      return NextResponse.json(
        { message: firstError?.message ?? 'Invalid request data' },
        { status: 400 }
      )
    }

    ;({ token, newPassword } = parsed.data)
  } catch {
    return NextResponse.json({ message: 'Invalid request body' }, { status: 400 })
  }

  try {
    await auth.api.resetPassword({
      body: { newPassword, token },
      method: 'POST',
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('Error during password reset', { error: err })
    const message =
      err instanceof Error
        ? err.message
        : 'Failed to reset password. Please try again or request a new reset link.'
    return NextResponse.json({ message }, { status: 500 })
  }
}

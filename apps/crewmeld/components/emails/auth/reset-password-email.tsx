import { Button, Hr, Section, Text } from '@react-email/components'
import { baseStyles, colors, typography } from '@/components/emails/_styles'
import { EmailLayout } from '@/components/emails/components'
import { getBrandConfig } from '@/lib/core/branding'

/** Props for the password reset email. */
interface ResetPasswordEmailProps {
  username?: string
  resetLink?: string
}

/**
 * Password reset email template rendered via react-email.
 * Sent when a user requests to reset their account password.
 */
export function ResetPasswordEmail({ username = '', resetLink = '' }: ResetPasswordEmailProps) {
  const brand = getBrandConfig()

  const salutation = username ? `Hello ${username},` : 'Hello,'

  return (
    <EmailLayout preview={`Reset your ${brand.name} password`} showUnsubscribe={false}>
      <Section style={{ paddingTop: '8px' }}>
        <Text style={baseStyles.paragraph}>{salutation}</Text>

        <Text style={baseStyles.paragraph}>
          We received a request to reset the password for your {brand.name} account. Use the button
          below to choose a new password.
        </Text>
      </Section>

      <Section style={{ margin: '20px 0' }}>
        <Button
          href={resetLink}
          style={{
            ...baseStyles.button,
            display: 'inline-block',
          }}
        >
          Set New Password
        </Button>
      </Section>

      <Hr style={{ borderColor: colors.divider, margin: '20px 0' }} />

      <Text
        style={{
          fontSize: typography.fontSize.caption,
          lineHeight: typography.lineHeight.caption,
          color: colors.textMuted,
          fontFamily: typography.fontFamily,
          margin: 0,
        }}
      >
        If you did not request a password reset, you can safely ignore this email. This link expires
        in 24 hours.
      </Text>
    </EmailLayout>
  )
}

export default ResetPasswordEmail

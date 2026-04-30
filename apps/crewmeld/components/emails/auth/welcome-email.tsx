import { Button, Hr, Section, Text } from '@react-email/components'
import { baseStyles, colors, typography } from '@/components/emails/_styles'
import { EmailLayout } from '@/components/emails/components'
import { getBrandConfig } from '@/lib/core/branding'
import { getBaseUrl } from '@/lib/core/utils/urls'

/** Props for the welcome email sent to new users after sign-up. */
interface WelcomeEmailProps {
  userName?: string
}

/**
 * Welcome email template rendered via react-email.
 * Sent once after account creation to help users get started.
 */
export function WelcomeEmail({ userName }: WelcomeEmailProps) {
  const brand = getBrandConfig()
  const baseUrl = getBaseUrl()

  const salutation = userName ? `Hi ${userName},` : 'Hi there,'

  return (
    <EmailLayout preview={`Welcome to ${brand.name}`} showUnsubscribe={false}>
      <Section style={{ paddingTop: '8px' }}>
        <Text style={baseStyles.paragraph}>{salutation}</Text>

        <Text style={baseStyles.paragraph}>
          You're now part of {brand.name}. Your account is set up and ready — start building AI
          digital employees for your team in minutes.
        </Text>

        <Text style={baseStyles.paragraph}>
          Got questions or feedback? Just reply to this email. We read every message.
        </Text>
      </Section>

      <Section style={{ margin: '20px 0' }}>
        <Button
          href={`${baseUrl}/login`}
          style={{
            ...baseStyles.button,
            display: 'inline-block',
          }}
        >
          Open Dashboard
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
        You received this email because you created a {brand.name} account.
      </Text>
    </EmailLayout>
  )
}

export default WelcomeEmail

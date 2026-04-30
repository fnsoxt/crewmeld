import { createLogger } from '@crewmeld/logger'
import { Button, Hr, Section, Text } from '@react-email/components'
import { baseStyles, colors, typography } from '@/components/emails/_styles'
import { EmailLayout } from '@/components/emails/components'
import { getBrandConfig } from '@/lib/core/branding'
import { getBaseUrl } from '@/lib/core/utils/urls'

/** Props for the general organization invitation email. */
interface InvitationEmailProps {
  inviterName?: string
  organizationName?: string
  inviteLink?: string
}

const logger = createLogger('InvitationEmail')

/**
 * General team invitation email template rendered via react-email.
 * Sent when a user is invited to join an organization on the platform.
 */
export function InvitationEmail({
  inviterName = 'A team member',
  organizationName = 'an organization',
  inviteLink = '',
}: InvitationEmailProps) {
  const brand = getBrandConfig()
  const baseUrl = getBaseUrl()

  let primaryAction = inviteLink

  if (inviteLink && !inviteLink.includes('token=')) {
    try {
      const url = new URL(inviteLink)
      const invitationId = url.pathname.split('/').pop()
      if (invitationId) {
        primaryAction = `${baseUrl}/invite/${invitationId}?token=${invitationId}`
      }
    } catch (e) {
      logger.error('Error parsing invite link:', e)
    }
  }

  return (
    <EmailLayout
      preview={`You've been invited to join ${organizationName} on ${brand.name}`}
      showUnsubscribe={false}
    >
      <Section style={{ paddingTop: '8px' }}>
        <Text style={baseStyles.paragraph}>Hello,</Text>

        <Text style={baseStyles.paragraph}>
          <strong>{inviterName}</strong> has invited you to join <strong>{organizationName}</strong>{' '}
          on {brand.name}. Accept the invitation below to get started.
        </Text>
      </Section>

      <Section style={{ margin: '20px 0' }}>
        <Button
          href={primaryAction}
          style={{
            ...baseStyles.button,
            display: 'inline-block',
          }}
        >
          Accept Invitation
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
        This invitation expires in 48 hours. If you were not expecting this email, you can safely
        ignore it.
      </Text>
    </EmailLayout>
  )
}

export default InvitationEmail

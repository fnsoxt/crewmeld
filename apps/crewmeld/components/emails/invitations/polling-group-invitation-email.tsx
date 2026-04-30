import { Button, Hr, Section, Text } from '@react-email/components'
import { baseStyles, colors, typography } from '@/components/emails/_styles'
import { EmailLayout } from '@/components/emails/components'
import { getBrandConfig } from '@/lib/core/branding'

/** Props for the email polling group invitation. */
interface PollingGroupInvitationEmailProps {
  inviterName?: string
  organizationName?: string
  pollingGroupName?: string
  provider?: 'google-email' | 'outlook'
  inviteLink?: string
}

/**
 * Polling group invitation email template rendered via react-email.
 * Sent when a user is invited to connect their mailbox to an email polling group.
 */
export function PollingGroupInvitationEmail({
  inviterName = 'A team member',
  organizationName = 'an organization',
  pollingGroupName = 'a polling group',
  provider = 'google-email',
  inviteLink = '',
}: PollingGroupInvitationEmailProps) {
  const brand = getBrandConfig()
  const mailboxLabel = provider === 'google-email' ? 'Gmail' : 'Outlook'

  return (
    <EmailLayout
      preview={`Join the "${pollingGroupName}" email polling group on ${brand.name}`}
      showUnsubscribe={false}
    >
      <Section style={{ paddingTop: '8px' }}>
        <Text style={baseStyles.paragraph}>Hello,</Text>

        <Text style={baseStyles.paragraph}>
          <strong>{inviterName}</strong> from <strong>{organizationName}</strong> has invited you to
          join the <strong>{pollingGroupName}</strong> polling group on {brand.name}.
        </Text>

        <Text style={baseStyles.paragraph}>
          Accepting this invitation will connect your {mailboxLabel} account so that incoming emails
          can trigger automated digital-employee workflows on your behalf.
        </Text>
      </Section>

      <Section style={{ margin: '20px 0' }}>
        <Button
          href={inviteLink}
          style={{
            ...baseStyles.button,
            display: 'inline-block',
          }}
        >
          Connect {mailboxLabel} &amp; Accept
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
        This invitation expires in 7 days. If you were not expecting this email, you can safely
        ignore it — no action will be taken.
      </Text>
    </EmailLayout>
  )
}

export default PollingGroupInvitationEmail

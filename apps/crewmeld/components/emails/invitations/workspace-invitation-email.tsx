import { createLogger } from '@crewmeld/logger'
import { Button, Hr, Section, Text } from '@react-email/components'
import { baseStyles, colors, typography } from '@/components/emails/_styles'
import { EmailLayout } from '@/components/emails/components'
import { getBrandConfig } from '@/lib/core/branding'
import { getBaseUrl } from '@/lib/core/utils/urls'

const logger = createLogger('WorkspaceInvitationEmail')

/** Props for the workspace-specific invitation email. */
interface WorkspaceInvitationEmailProps {
  workspaceName?: string
  inviterName?: string
  invitationLink?: string
}

/**
 * Workspace invitation email template rendered via react-email.
 * Sent when a user is invited to a specific workspace on the platform.
 */
export function WorkspaceInvitationEmail({
  workspaceName = 'Workspace',
  inviterName = 'Someone',
  invitationLink = '',
}: WorkspaceInvitationEmailProps) {
  const brand = getBrandConfig()
  const baseUrl = getBaseUrl()

  let primaryAction = invitationLink

  try {
    if (
      invitationLink.includes('/api/workspaces/invitations/accept') ||
      invitationLink.match(/\/api\/workspaces\/invitations\/[^?]+\?token=/)
    ) {
      const url = new URL(invitationLink)
      const token = url.searchParams.get('token')
      if (token) {
        primaryAction = `${baseUrl}/invite/${token}?token=${token}`
      }
    }
  } catch (e) {
    logger.error('Error enhancing invitation link:', e)
  }

  return (
    <EmailLayout
      preview={`${inviterName} invited you to the "${workspaceName}" workspace on ${brand.name}`}
      showUnsubscribe={false}
    >
      <Section style={{ paddingTop: '8px' }}>
        <Text style={baseStyles.paragraph}>Hello,</Text>

        <Text style={baseStyles.paragraph}>
          <strong>{inviterName}</strong> has invited you to collaborate in the{' '}
          <strong>{workspaceName}</strong> workspace on {brand.name}.
        </Text>

        <Text style={baseStyles.paragraph}>
          Accept the invitation below to gain access and start working with your team.
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
          Join Workspace
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
        This invitation expires in 7 days. If you were not expecting this, you can safely ignore it.
      </Text>
    </EmailLayout>
  )
}

export default WorkspaceInvitationEmail

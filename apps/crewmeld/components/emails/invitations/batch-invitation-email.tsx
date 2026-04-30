import { Button, Column, Hr, Row, Section, Text } from '@react-email/components'
import { baseStyles, colors, typography } from '@/components/emails/_styles'
import { EmailLayout } from '@/components/emails/components'
import { getBrandConfig } from '@/lib/core/branding'

/** A single workspace included in the batch invitation. */
interface WorkspaceInvitation {
  workspaceId: string
  workspaceName: string
  permission: 'admin' | 'write' | 'read'
}

/** Props for the batch invitation email covering org + multiple workspaces. */
interface BatchInvitationEmailProps {
  inviterName: string
  organizationName: string
  organizationRole: 'admin' | 'member'
  workspaceInvitations: WorkspaceInvitation[]
  acceptUrl: string
}

function resolvePermissionLabel(permission: string): string {
  switch (permission) {
    case 'admin':
      return 'Admin — full access'
    case 'write':
      return 'Editor — can edit workflows'
    case 'read':
      return 'Viewer — read-only access'
    default:
      return permission
  }
}

function resolveRoleLabel(role: string): string {
  switch (role) {
    case 'admin':
      return 'Team Admin'
    case 'member':
      return 'Team Member'
    default:
      return role
  }
}

/**
 * Batch invitation email template rendered via react-email.
 * Sent when a user is invited to an organization and one or more workspaces simultaneously.
 */
export function BatchInvitationEmail({
  inviterName = 'Someone',
  organizationName = 'the team',
  organizationRole = 'member',
  workspaceInvitations = [],
  acceptUrl,
}: BatchInvitationEmailProps) {
  const brand = getBrandConfig()
  const workspaceCount = workspaceInvitations.length
  const hasWorkspaces = workspaceCount > 0

  const previewSuffix = hasWorkspaces
    ? ` and ${workspaceCount} workspace${workspaceCount !== 1 ? 's' : ''}`
    : ''

  return (
    <EmailLayout
      preview={`You've been invited to join ${organizationName}${previewSuffix} on ${brand.name}`}
      showUnsubscribe={false}
    >
      <Section style={{ paddingTop: '8px' }}>
        <Text style={baseStyles.paragraph}>Hello,</Text>

        <Text style={baseStyles.paragraph}>
          <strong>{inviterName}</strong> has invited you to join <strong>{organizationName}</strong>{' '}
          on {brand.name}.
        </Text>
      </Section>

      {/* Organization role summary */}
      <Section
        style={{
          backgroundColor: colors.bgOuter,
          borderRadius: '8px',
          padding: '14px 18px',
          margin: '16px 0',
          border: `1px solid ${colors.divider}`,
        }}
      >
        <Text
          style={{
            ...baseStyles.infoBoxTitle,
            marginBottom: '6px',
          }}
        >
          Your Organization Role
        </Text>
        <Text style={{ ...baseStyles.infoBoxList, fontWeight: 600 }}>
          {resolveRoleLabel(organizationRole)}
        </Text>
        <Text style={{ ...baseStyles.infoBoxList, marginTop: '4px' }}>
          {organizationRole === 'admin'
            ? 'Manage team members, billing, and workspace access.'
            : 'Access shared team billing and join workspaces as invited.'}
        </Text>
      </Section>

      {/* Workspace access list */}
      {hasWorkspaces && (
        <Section
          style={{
            backgroundColor: colors.bgOuter,
            borderRadius: '8px',
            padding: '14px 18px',
            margin: '16px 0',
            border: `1px solid ${colors.divider}`,
          }}
        >
          <Text style={{ ...baseStyles.infoBoxTitle, marginBottom: '10px' }}>
            Workspace Access ({workspaceCount})
          </Text>
          {workspaceInvitations.map((ws) => (
            <Row key={ws.workspaceId} style={{ marginBottom: '6px' }}>
              <Column>
                <Text style={{ ...baseStyles.infoBoxList, margin: 0 }}>
                  <strong>{ws.workspaceName}</strong> —{' '}
                  <span style={{ color: colors.textMuted }}>
                    {resolvePermissionLabel(ws.permission)}
                  </span>
                </Text>
              </Column>
            </Row>
          ))}
        </Section>
      )}

      <Section style={{ margin: '20px 0' }}>
        <Button
          href={acceptUrl}
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
        This invitation expires in 7 days. If you were not expecting this, you can safely ignore it.
      </Text>
    </EmailLayout>
  )
}

export default BatchInvitationEmail

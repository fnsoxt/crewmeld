import { Column, Container, Hr, Img, Link, Row, Section, Text } from '@react-email/components'
import { baseStyles, colors, spacing, typography } from '@/components/emails/_styles'
import { getBrandConfig } from '@/lib/core/branding'
import { isHosted } from '@/lib/core/config/feature-flags'
import { getBaseUrl } from '@/lib/core/utils/urls'

interface EmailFooterProps {
  baseUrl?: string
  messageId?: string
  /**
   * Whether to show the unsubscribe link.
   * Set to false for transactional emails where unsubscribe does not apply.
   */
  showUnsubscribe?: boolean
}

/**
 * Shared email footer rendered below the main white card.
 * Sits in the gray outer band and includes social icons, address,
 * contact link, optional message ID, and legal links.
 *
 * For non-transactional emails the unsubscribe href uses
 * {{UNSUBSCRIBE_TOKEN}} and {{UNSUBSCRIBE_EMAIL}} placeholders
 * that the mailer replaces at send time.
 */
export function EmailFooter({
  baseUrl = getBaseUrl(),
  messageId,
  showUnsubscribe = true,
}: EmailFooterProps) {
  const brand = getBrandConfig()

  const mutedLinkStyle = {
    color: colors.textMuted,
    textDecoration: 'underline',
    fontWeight: 'normal' as const,
    fontFamily: typography.fontFamily,
  }

  return (
    <Section
      style={{
        backgroundColor: colors.footerBg,
        width: '100%',
        paddingTop: '32px',
        paddingBottom: '32px',
      }}
    >
      <Container
        style={{
          maxWidth: `${spacing.containerWidth}px`,
          margin: '0 auto',
          padding: `0 ${spacing.gutter}px`,
        }}
      >
        {/* Social icons */}
        <Row style={{ marginBottom: '16px' }}>
          <Column style={{ width: '28px', paddingRight: '8px' }}>
            <Link href={`${baseUrl}/x`} rel='noopener noreferrer'>
              <Img src={`${baseUrl}/static/x-icon.png`} width='20' height='20' alt='X' />
            </Link>
          </Column>
          <Column style={{ width: '28px', paddingRight: '8px' }}>
            <Link href={`${baseUrl}/discord`} rel='noopener noreferrer'>
              <Img
                src={`${baseUrl}/static/discord-icon.png`}
                width='20'
                height='20'
                alt='Discord'
              />
            </Link>
          </Column>
          <Column style={{ width: '28px' }}>
            <Link href={`${baseUrl}/github`} rel='noopener noreferrer'>
              <Img src={`${baseUrl}/static/github-icon.png`} width='20' height='20' alt='GitHub' />
            </Link>
          </Column>
        </Row>

        <Hr style={{ borderColor: colors.divider, margin: '0 0 12px 0' }} />

        {/* Brand name / address */}
        <Text style={{ ...baseStyles.footerText, marginBottom: '6px' }}>
          {brand.name}
          {isHosted && <>, 80 Langton St, San Francisco, CA 94103, USA</>}
        </Text>

        {/* Support contact */}
        <Text style={{ ...baseStyles.footerText, marginBottom: '6px' }}>
          Questions?{' '}
          <a href={`mailto:${brand.supportEmail}`} style={mutedLinkStyle}>
            {brand.supportEmail}
          </a>
        </Text>

        {/* Optional message reference ID */}
        {messageId && (
          <Text style={{ ...baseStyles.footerText, marginBottom: '6px' }}>
            Reference ID: {messageId}
          </Text>
        )}

        {/* Legal links */}
        <Text style={{ ...baseStyles.footerText, marginBottom: '6px' }}>
          <a href={`${baseUrl}/privacy`} style={mutedLinkStyle} rel='noopener noreferrer'>
            Privacy Policy
          </a>
          {' · '}
          <a href={`${baseUrl}/terms`} style={mutedLinkStyle} rel='noopener noreferrer'>
            Terms of Service
          </a>
          {showUnsubscribe && (
            <>
              {' · '}
              <a
                href={`${baseUrl}/unsubscribe?token={{UNSUBSCRIBE_TOKEN}}&email={{UNSUBSCRIBE_EMAIL}}`}
                style={mutedLinkStyle}
                rel='noopener noreferrer'
              >
                Unsubscribe
              </a>
            </>
          )}
        </Text>

        {/* Copyright */}
        <Text style={{ ...baseStyles.footerText, marginBottom: 0 }}>
          &copy; {new Date().getFullYear()} {brand.name}. All rights reserved.
        </Text>
      </Container>
    </Section>
  )
}

export default EmailFooter

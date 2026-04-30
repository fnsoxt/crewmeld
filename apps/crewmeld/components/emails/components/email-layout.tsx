import { Body, Container, Head, Html, Img, Preview, Section } from '@react-email/components'
import { baseStyles, spacing } from '@/components/emails/_styles'
import { EmailFooter } from '@/components/emails/components/email-footer'
import { getBrandConfig } from '@/lib/core/branding'
import { getBaseUrl } from '@/lib/core/utils/urls'

interface EmailLayoutProps {
  /** Preview text shown in the email client inbox list. */
  preview: string
  /** Email body content rendered inside the card. */
  children: React.ReactNode
  /** When true, omits the footer — use for internal/ops emails. */
  hideFooter?: boolean
  /**
   * Whether to include the unsubscribe link in the footer.
   * Set to false for transactional emails (OTP, invitations, etc.).
   */
  showUnsubscribe: boolean
}

/**
 * Shared layout wrapper for all email templates.
 * Renders the full HTML shell: Html → Head → Body → card container with
 * logo header, content slot, and optional footer in the gray outer band.
 */
export function EmailLayout({
  preview,
  children,
  hideFooter = false,
  showUnsubscribe,
}: EmailLayoutProps) {
  const brand = getBrandConfig()
  const baseUrl = getBaseUrl()

  return (
    <Html lang='en' dir='ltr'>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={baseStyles.main}>
        {/* Centred card */}
        <Container style={{ ...baseStyles.container, maxWidth: `${spacing.containerWidth}px` }}>
          {/* Logo header */}
          <Section style={baseStyles.header}>
            <Img
              src={brand.logoUrl || `${baseUrl}/brand/color/email/type.png`}
              width='70'
              alt={brand.name}
              style={{ display: 'block' }}
            />
          </Section>

          {/* Template-specific content */}
          <Section style={baseStyles.content}>{children}</Section>
        </Container>

        {/* Gray footer band */}
        {!hideFooter && <EmailFooter baseUrl={baseUrl} showUnsubscribe={showUnsubscribe} />}
      </Body>
    </Html>
  )
}

export default EmailLayout

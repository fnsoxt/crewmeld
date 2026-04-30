import { Column, Hr, Row, Section, Text } from '@react-email/components'
import { baseStyles, colors, typography } from '@/components/emails/_styles'
import { EmailLayout } from '@/components/emails/components'
import { getBrandConfig } from '@/lib/core/branding'

/** Supported OTP delivery contexts. */
type OTPType = 'sign-in' | 'email-verification' | 'forget-password' | 'chat-access'

/** Props for the OTP verification email. */
interface OTPVerificationEmailProps {
  otp: string
  email?: string
  type?: OTPType
  chatTitle?: string
}

function resolvePreviewText(type: OTPType, brandName: string, chatTitle?: string): string {
  switch (type) {
    case 'sign-in':
      return `Sign in to ${brandName}`
    case 'email-verification':
      return `Verify your email for ${brandName}`
    case 'forget-password':
      return `Reset your ${brandName} password`
    case 'chat-access':
      return `Verification code for ${chatTitle ?? 'Chat'}`
    default:
      return `Verification code for ${brandName}`
  }
}

/**
 * OTP verification email template rendered via react-email.
 * Delivers a one-time passcode for sign-in, email verification, password reset, or chat access.
 */
export function OTPVerificationEmail({
  otp,
  email = '',
  type = 'email-verification',
  chatTitle,
}: OTPVerificationEmailProps) {
  const brand = getBrandConfig()
  const previewText = resolvePreviewText(type, brand.name, chatTitle)

  return (
    <EmailLayout preview={previewText} showUnsubscribe={false}>
      <Section style={{ paddingTop: '8px' }}>
        <Text style={baseStyles.paragraph}>Here is your one-time verification code:</Text>
      </Section>

      {/* Code display block */}
      <Section
        style={{
          margin: '16px 0',
          padding: '16px 20px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: `1px solid ${colors.divider}`,
          textAlign: 'center' as const,
        }}
      >
        <Row>
          <Column align='center'>
            <Text
              style={{
                fontSize: '32px',
                fontWeight: 'bold' as const,
                letterSpacing: '6px',
                color: colors.textPrimary,
                fontFamily: typography.fontFamily,
                margin: 0,
              }}
            >
              {otp}
            </Text>
          </Column>
        </Row>
      </Section>

      <Text style={{ ...baseStyles.paragraph, marginTop: '8px' }}>
        This code is valid for <strong>15 minutes</strong>. Enter it promptly to complete
        verification.
      </Text>

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
        Never share this code with anyone. If you did not request it, you can safely ignore this
        email.
        {email ? ` This code was sent to ${email}.` : ''}
      </Text>
    </EmailLayout>
  )
}

export default OTPVerificationEmail

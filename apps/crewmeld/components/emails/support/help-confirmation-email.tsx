import { Hr, Section, Text } from '@react-email/components'
import { format } from 'date-fns'
import { baseStyles, colors, typography } from '@/components/emails/_styles'
import { EmailLayout } from '@/components/emails/components'

/** Supported support request categories. */
type SupportRequestType = 'bug' | 'feedback' | 'feature_request' | 'other'

/** Props for the support request confirmation email. */
interface HelpConfirmationEmailProps {
  type?: SupportRequestType
  attachmentCount?: number
  submittedDate?: Date
}

function resolveTypeLabel(type: SupportRequestType): string {
  switch (type) {
    case 'bug':
      return 'Bug Report'
    case 'feedback':
      return 'Feedback'
    case 'feature_request':
      return 'Feature Request'
    case 'other':
      return 'General Inquiry'
    default:
      return 'Request'
  }
}

/**
 * Support help confirmation email template rendered via react-email.
 * Sent to users after they submit a support request or feedback form.
 */
export function HelpConfirmationEmail({
  type = 'other',
  attachmentCount = 0,
  submittedDate = new Date(),
}: HelpConfirmationEmailProps) {
  const categoryLabel = resolveTypeLabel(type)

  return (
    <EmailLayout
      preview={`Your ${categoryLabel.toLowerCase()} has been received`}
      showUnsubscribe={false}
    >
      <Section style={{ paddingTop: '8px' }}>
        <Text style={baseStyles.paragraph}>Hello,</Text>

        <Text style={baseStyles.paragraph}>
          We have received your <strong>{categoryLabel.toLowerCase()}</strong>. Our support team
          will review it and follow up with you shortly.
        </Text>

        {attachmentCount > 0 && (
          <Text style={{ ...baseStyles.paragraph, color: colors.textMuted }}>
            {attachmentCount} screenshot{attachmentCount > 1 ? 's were' : ' was'} included with your
            submission.
          </Text>
        )}
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
        Submitted on {format(submittedDate, 'MMMM do, yyyy')}.
      </Text>
    </EmailLayout>
  )
}

export default HelpConfirmationEmail

import { Hr, Link, Section, Text } from '@react-email/components'
import { format } from 'date-fns'
import { baseStyles, colors, typography } from '@/components/emails/_styles'
import { EmailLayout } from '@/components/emails/components'
import { getBrandConfig } from '@/lib/core/branding'
import { getBaseUrl } from '@/lib/core/utils/urls'

/** Props for the applicant-facing careers confirmation email. */
interface CareersConfirmationEmailProps {
  name: string
  position: string
  submittedDate?: Date
}

/**
 * Careers confirmation email template rendered via react-email.
 * Sent to the applicant after a career application is successfully submitted.
 */
export function CareersConfirmationEmail({
  name,
  position,
  submittedDate = new Date(),
}: CareersConfirmationEmailProps) {
  const brand = getBrandConfig()
  const baseUrl = getBaseUrl()

  return (
    <EmailLayout
      preview={`Your application to ${brand.name} has been received`}
      showUnsubscribe={false}
    >
      <Section style={{ paddingTop: '8px' }}>
        <Text style={baseStyles.paragraph}>Hello {name},</Text>

        <Text style={baseStyles.paragraph}>
          Thank you for applying for the <strong>{position}</strong> role at {brand.name}. We have
          received your application and our team reviews every submission carefully.
        </Text>

        <Text style={baseStyles.paragraph}>
          We will be in touch if your background is a strong match. In the meantime, feel free to
          explore our{' '}
          <Link href='https://docs.crewmeld.com' style={baseStyles.link}>
            documentation
          </Link>{' '}
          or visit our{' '}
          <Link href={`${baseUrl}/studio`} style={baseStyles.link}>
            platform
          </Link>{' '}
          to see what we are building.
        </Text>
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
        Application submitted on {format(submittedDate, 'MMMM do, yyyy')}.
      </Text>
    </EmailLayout>
  )
}

export default CareersConfirmationEmail

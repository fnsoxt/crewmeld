import { Column, Hr, Row, Section, Text } from '@react-email/components'
import { format } from 'date-fns'
import { baseStyles, colors, typography } from '@/components/emails/_styles'
import { EmailLayout } from '@/components/emails/components'

/** Props for the internal careers submission notification email. */
interface CareersSubmissionEmailProps {
  name: string
  email: string
  phone?: string
  position: string
  linkedin?: string
  portfolio?: string
  experience: string
  location: string
  message: string
  submittedDate?: Date
}

function resolveExperienceLabel(experience: string): string {
  const map: Record<string, string> = {
    '0-1': '0–1 years',
    '1-3': '1–3 years',
    '3-5': '3–5 years',
    '5-10': '5–10 years',
    '10+': '10+ years',
  }
  return map[experience] ?? experience
}

/** A two-column label/value row for the applicant details table. */
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Row style={{ borderBottom: `1px solid ${colors.divider}`, padding: '8px 0' }}>
      <Column style={{ width: '38%' }}>
        <Text
          style={{
            fontSize: typography.fontSize.small,
            fontWeight: 600,
            color: colors.textMuted,
            fontFamily: typography.fontFamily,
            margin: 0,
          }}
        >
          {label}
        </Text>
      </Column>
      <Column>
        <Text
          style={{
            fontSize: typography.fontSize.small,
            color: colors.textPrimary,
            fontFamily: typography.fontFamily,
            margin: 0,
          }}
        >
          {children}
        </Text>
      </Column>
    </Row>
  )
}

/**
 * Internal careers submission email template rendered via react-email.
 * Sent to the hiring team when a new career application arrives.
 */
export function CareersSubmissionEmail({
  name,
  email,
  phone,
  position,
  linkedin,
  portfolio,
  experience,
  location,
  message,
  submittedDate = new Date(),
}: CareersSubmissionEmailProps) {
  return (
    <EmailLayout
      preview={`New application from ${name} — ${position}`}
      hideFooter
      showUnsubscribe={false}
    >
      <Section style={{ paddingTop: '8px' }}>
        <Text
          style={{
            ...baseStyles.paragraph,
            fontSize: '18px',
            fontWeight: 700,
            color: colors.textPrimary,
            marginTop: 0,
          }}
        >
          New Career Application
        </Text>

        <Text style={baseStyles.paragraph}>
          Received on {format(submittedDate, 'MMMM do, yyyy')} at {format(submittedDate, 'h:mm a')}.
        </Text>
      </Section>

      {/* Applicant details */}
      <Section
        style={{
          backgroundColor: colors.bgOuter,
          borderRadius: '8px',
          padding: '16px 20px',
          margin: '16px 0',
          border: `1px solid ${colors.divider}`,
        }}
      >
        <Text
          style={{
            fontSize: '15px',
            fontWeight: 700,
            color: colors.textPrimary,
            fontFamily: typography.fontFamily,
            margin: '0 0 12px 0',
          }}
        >
          Applicant Details
        </Text>

        <InfoRow label='Name'>{name}</InfoRow>
        <InfoRow label='Email'>
          <a href={`mailto:${email}`} style={baseStyles.link}>
            {email}
          </a>
        </InfoRow>
        {phone && (
          <InfoRow label='Phone'>
            <a href={`tel:${phone}`} style={baseStyles.link}>
              {phone}
            </a>
          </InfoRow>
        )}
        <InfoRow label='Position'>{position}</InfoRow>
        <InfoRow label='Experience'>{resolveExperienceLabel(experience)}</InfoRow>
        <InfoRow label='Location'>{location}</InfoRow>
        {linkedin && (
          <InfoRow label='LinkedIn'>
            <a href={linkedin} target='_blank' rel='noopener noreferrer' style={baseStyles.link}>
              View Profile
            </a>
          </InfoRow>
        )}
        {portfolio && (
          <InfoRow label='Portfolio'>
            <a href={portfolio} target='_blank' rel='noopener noreferrer' style={baseStyles.link}>
              View Portfolio
            </a>
          </InfoRow>
        )}
      </Section>

      {/* Applicant message */}
      <Section
        style={{
          backgroundColor: colors.bgOuter,
          borderRadius: '8px',
          padding: '16px 20px',
          margin: '16px 0',
          border: `1px solid ${colors.divider}`,
        }}
      >
        <Text
          style={{
            fontSize: '15px',
            fontWeight: 700,
            color: colors.textPrimary,
            fontFamily: typography.fontFamily,
            margin: '0 0 10px 0',
          }}
        >
          About the Applicant
        </Text>
        <Text
          style={{
            fontSize: typography.fontSize.small,
            color: colors.textPrimary,
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap' as const,
            fontFamily: typography.fontFamily,
            margin: 0,
          }}
        >
          {message}
        </Text>
      </Section>

      <Hr style={{ borderColor: colors.divider, margin: '16px 0' }} />

      <Text
        style={{
          fontSize: typography.fontSize.caption,
          color: colors.textMuted,
          fontFamily: typography.fontFamily,
          margin: 0,
        }}
      >
        Submitted via the careers form on {format(submittedDate, 'MMMM do, yyyy')}.
      </Text>
    </EmailLayout>
  )
}

export default CareersSubmissionEmail

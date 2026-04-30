import { render } from '@react-email/components'
import { OTPVerificationEmail, ResetPasswordEmail, WelcomeEmail } from '@/components/emails/auth'
import { CareersConfirmationEmail, CareersSubmissionEmail } from '@/components/emails/careers'
import {
  BatchInvitationEmail,
  InvitationEmail,
  PollingGroupInvitationEmail,
  WorkspaceInvitationEmail,
} from '@/components/emails/invitations'
import { HelpConfirmationEmail } from '@/components/emails/support'

export type { EmailSubjectType } from './subjects'
export { getEmailSubject } from './subjects'

/** Workspace invitation entry used in batch invitations. */
interface WorkspaceInvitation {
  workspaceId: string
  workspaceName: string
  permission: 'admin' | 'write' | 'read'
}

/**
 * Renders an OTP / verification-code email to an HTML string.
 *
 * @param otp - The one-time passcode to display
 * @param email - Recipient address (shown in footer disclaimer)
 * @param type - Delivery context controlling preview text
 * @param chatTitle - Optional chat session name for 'chat-access' type
 */
export async function renderOTPEmail(
  otp: string,
  email: string,
  type: 'sign-in' | 'email-verification' | 'forget-password' = 'email-verification',
  chatTitle?: string
): Promise<string> {
  return render(OTPVerificationEmail({ otp, email, type, chatTitle }))
}

/**
 * Renders a password-reset email to an HTML string.
 *
 * @param username - Display name of the account owner
 * @param resetLink - URL the user clicks to set a new password
 */
export async function renderPasswordResetEmail(
  username: string,
  resetLink: string
): Promise<string> {
  return render(ResetPasswordEmail({ username, resetLink }))
}

/**
 * Renders a general organization invitation email to an HTML string.
 *
 * @param inviterName - Name of the person sending the invite
 * @param organizationName - Name of the organization being joined
 * @param invitationUrl - Accept-invitation URL
 */
export async function renderInvitationEmail(
  inviterName: string,
  organizationName: string,
  invitationUrl: string
): Promise<string> {
  return render(
    InvitationEmail({
      inviterName,
      organizationName,
      inviteLink: invitationUrl,
    })
  )
}

/**
 * Renders a batch invitation email (org + workspaces) to an HTML string.
 *
 * @param inviterName - Name of the person sending the invite
 * @param organizationName - Target organization name
 * @param organizationRole - Role granted at the org level
 * @param workspaceInvitations - List of workspace access entries
 * @param acceptUrl - Single accept URL covering all invitations
 */
export async function renderBatchInvitationEmail(
  inviterName: string,
  organizationName: string,
  organizationRole: 'admin' | 'member',
  workspaceInvitations: WorkspaceInvitation[],
  acceptUrl: string
): Promise<string> {
  return render(
    BatchInvitationEmail({
      inviterName,
      organizationName,
      organizationRole,
      workspaceInvitations,
      acceptUrl,
    })
  )
}

/**
 * Renders a support help-confirmation email to an HTML string.
 *
 * @param type - Category of the support request
 * @param attachmentCount - Number of screenshots/files attached
 */
export async function renderHelpConfirmationEmail(
  type: 'bug' | 'feedback' | 'feature_request' | 'other',
  attachmentCount = 0
): Promise<string> {
  return render(
    HelpConfirmationEmail({
      type,
      attachmentCount,
      submittedDate: new Date(),
    })
  )
}

/**
 * Renders the new-user welcome email to an HTML string.
 *
 * @param userName - Optional display name for personalised greeting
 */
export async function renderWelcomeEmail(userName?: string): Promise<string> {
  return render(WelcomeEmail({ userName }))
}

/**
 * Renders a workspace-specific invitation email to an HTML string.
 *
 * @param inviterName - Name of the person sending the invite
 * @param workspaceName - Name of the target workspace
 * @param invitationLink - Accept URL (enhanced to /invite/:token if needed)
 */
export async function renderWorkspaceInvitationEmail(
  inviterName: string,
  workspaceName: string,
  invitationLink: string
): Promise<string> {
  return render(
    WorkspaceInvitationEmail({
      inviterName,
      workspaceName,
      invitationLink,
    })
  )
}

/**
 * Renders a polling-group invitation email to an HTML string.
 */
export async function renderPollingGroupInvitationEmail(params: {
  inviterName: string
  organizationName: string
  pollingGroupName: string
  provider: 'google-email' | 'outlook'
  inviteLink: string
}): Promise<string> {
  return render(
    PollingGroupInvitationEmail({
      inviterName: params.inviterName,
      organizationName: params.organizationName,
      pollingGroupName: params.pollingGroupName,
      provider: params.provider,
      inviteLink: params.inviteLink,
    })
  )
}

/**
 * Renders a careers application confirmation email to an HTML string.
 *
 * @param name - Applicant's full name
 * @param position - Role applied for
 */
export async function renderCareersConfirmationEmail(
  name: string,
  position: string
): Promise<string> {
  return render(
    CareersConfirmationEmail({
      name,
      position,
    })
  )
}

/**
 * Renders the internal careers submission notification email to an HTML string.
 */
export async function renderCareersSubmissionEmail(params: {
  name: string
  email: string
  phone?: string
  position: string
  linkedin?: string
  portfolio?: string
  experience: string
  location: string
  message: string
}): Promise<string> {
  return render(
    CareersSubmissionEmail({
      name: params.name,
      email: params.email,
      phone: params.phone,
      position: params.position,
      linkedin: params.linkedin,
      portfolio: params.portfolio,
      experience: params.experience,
      location: params.location,
      message: params.message,
    })
  )
}

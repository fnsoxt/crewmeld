/**
 * Base design tokens and shared style objects for all email templates.
 * Color values are derived from globals.css light-mode tokens.
 */

/** Color palette sourced from globals.css light mode */
export const colors = {
  /** Outer canvas / section background */
  bgOuter: '#F7F9FC',
  /** Card body background — pure white */
  bgCard: '#ffffff',
  /** Primary body text */
  textPrimary: '#2d2d2d',
  /** Secondary body text */
  textSecondary: '#404040',
  /** Tertiary body text */
  textTertiary: '#5c5c5c',
  /** Subdued / footer text */
  textMuted: '#737373',
  /** Brand accent — purple */
  brandPrimary: '#6f3dfa',
  /** Brand CTA — green (matches Run/Deploy buttons in the app) */
  brandTertiary: '#32bd7e',
  /** Rule / border color */
  divider: '#ededed',
  /** Footer section background */
  footerBg: '#F7F9FC',
}

/** Typography scale */
export const typography = {
  fontFamily: "-apple-system, 'SF Pro Display', 'SF Pro Text', 'Helvetica', sans-serif",
  fontSize: {
    body: '16px',
    small: '14px',
    caption: '12px',
  },
  lineHeight: {
    body: '24px',
    caption: '20px',
  },
}

/** Layout spacing constants */
export const spacing = {
  containerWidth: 600,
  gutter: 40,
  sectionGap: 20,
  paragraphGap: 12,
  /** Logo render width in pixels */
  logoWidth: 90,
}

/** Shared inline-style objects consumed by every email template */
export const baseStyles = {
  fontFamily: typography.fontFamily,

  /** Outermost body wrapper — sets canvas background */
  main: {
    backgroundColor: colors.bgOuter,
    fontFamily: typography.fontFamily,
    padding: '32px 0',
  },

  /** Centring wrapper around the card */
  wrapper: {
    maxWidth: `${spacing.containerWidth}px`,
    margin: '0 auto',
  },

  /** White card container with rounded corners */
  container: {
    maxWidth: `${spacing.containerWidth}px`,
    margin: '0 auto',
    backgroundColor: colors.bgCard,
    borderRadius: '16px',
    overflow: 'hidden',
  },

  /** Logo header band at the top of the card */
  header: {
    padding: `32px ${spacing.gutter}px 16px ${spacing.gutter}px`,
    textAlign: 'left' as const,
  },

  /** Body content region with horizontal padding */
  content: {
    padding: `0 ${spacing.gutter}px 32px ${spacing.gutter}px`,
  },

  /** Standard paragraph text */
  paragraph: {
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
    color: colors.textSecondary,
    fontWeight: 400,
    fontFamily: typography.fontFamily,
    margin: `${spacing.paragraphGap}px 0`,
  },

  /** Bold inline label (e.g. "Platform:", "Duration:") */
  label: {
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
    color: colors.textSecondary,
    fontWeight: 'bold' as const,
    fontFamily: typography.fontFamily,
    margin: 0,
    display: 'inline',
  },

  /** Primary CTA button — mirrors the app's tertiary button */
  button: {
    display: 'inline-block',
    backgroundColor: colors.brandTertiary,
    color: '#ffffff',
    fontWeight: 500,
    fontSize: '14px',
    padding: '6px 12px',
    borderRadius: '5px',
    textDecoration: 'none',
    textAlign: 'center' as const,
    margin: '4px 0',
    fontFamily: typography.fontFamily,
  },

  /** Anchor link style */
  link: {
    color: colors.brandTertiary,
    fontWeight: 'bold' as const,
    textDecoration: 'none',
  },

  /** Thin horizontal rule */
  divider: {
    borderTop: `1px solid ${colors.divider}`,
    margin: '16px 0',
  },

  /** Footer wrapper (gray band below the card) */
  footer: {
    maxWidth: `${spacing.containerWidth}px`,
    margin: '0 auto',
    padding: `32px ${spacing.gutter}px`,
    textAlign: 'left' as const,
  },

  /** Small footer text */
  footerText: {
    fontSize: typography.fontSize.caption,
    lineHeight: typography.lineHeight.caption,
    color: colors.textMuted,
    fontFamily: typography.fontFamily,
    margin: '0 0 10px 0',
  },

  /** OTP / verification code container */
  codeContainer: {
    margin: '12px 0',
    padding: '12px 16px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
    border: `1px solid ${colors.divider}`,
    textAlign: 'center' as const,
  },

  /** OTP / verification code numeral */
  code: {
    fontSize: '24px',
    fontWeight: 'bold' as const,
    letterSpacing: '3px',
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    margin: 0,
  },

  /** Monospace pre-formatted block (JSON output, stack traces) */
  codeBlock: {
    fontSize: typography.fontSize.caption,
    lineHeight: typography.lineHeight.caption,
    color: colors.textSecondary,
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap' as const,
    wordWrap: 'break-word' as const,
    margin: 0,
  },

  /** Highlighted information panel */
  infoBox: {
    backgroundColor: colors.bgOuter,
    padding: '16px 18px',
    borderRadius: '6px',
    margin: '16px 0',
  },

  /** Title inside an info panel */
  infoBoxTitle: {
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
    fontWeight: 600,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
    margin: '0 0 8px 0',
  },

  /** Body line inside an info panel */
  infoBoxList: {
    fontSize: typography.fontSize.body,
    lineHeight: '1.6',
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    margin: 0,
  },

  /** Decorative multi-segment border row wrapper */
  sectionsBorders: {
    width: '100%',
    display: 'flex',
  },

  /** Left/right segment of the decorative border */
  sectionBorder: {
    borderBottom: `1px solid ${colors.divider}`,
    width: '249px',
  },

  /** Centre accent segment of the decorative border */
  sectionCenter: {
    borderBottom: `1px solid ${colors.brandTertiary}`,
    width: '102px',
  },

  /** Zero-height spacer cell for table-based vertical rhythm */
  spacer: {
    border: 0,
    margin: 0,
    padding: 0,
    fontSize: '1px',
    lineHeight: '1px',
  },

  /** Fixed-width gutter cell for table-based horizontal padding */
  gutter: {
    border: 0,
    margin: 0,
    padding: 0,
    fontSize: '1px',
    lineHeight: '1px',
    width: `${spacing.gutter}px`,
  },

  /** Generic detail row (e.g. Platform, Device, Time) */
  infoRow: {
    fontSize: typography.fontSize.body,
    lineHeight: typography.lineHeight.body,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
    margin: '8px 0',
  },
}

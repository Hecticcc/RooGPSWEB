/**
 * Email configuration – env and branding.
 * Logo: set EMAIL_BRAND_LOGO_URL (e.g. https://roogps.com/logo.png).
 */

export const emailConfig = {
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  from: process.env.EMAIL_FROM ?? 'noreply@roogps.com',
  brandLogoUrl: process.env.EMAIL_BRAND_LOGO_URL ?? 'https://roogps.com/logo.png',
  appBaseUrl: (process.env.APP_BASE_URL ?? 'https://roogps.com').replace(/\/$/, ''),
} as const;

export function isEmailConfigured(): boolean {
  return !!emailConfig.resendApiKey && emailConfig.resendApiKey.length > 0;
}

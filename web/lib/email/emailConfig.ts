/**
 * Email configuration – env and branding.
 * Logo: set EMAIL_BRAND_LOGO_URL (e.g. https://roogps.com/logo.png).
 * Sender: set EMAIL_FROM to the full address, e.g. noreply@mail.roogps.com (Resend requires the verified sending domain).
 */

const RAW_FROM = process.env.EMAIL_FROM ?? 'noreply@mail.roogps.com';
// Ensure we never send from @roogps.com (unverified); use mail.roogps.com subdomain for deliverability.
const NORMALIZED_FROM =
  RAW_FROM.trim().toLowerCase().endsWith('@roogps.com') && !RAW_FROM.trim().toLowerCase().includes('@mail.roogps.com')
    ? 'noreply@mail.roogps.com'
    : RAW_FROM.trim() || 'noreply@mail.roogps.com';

export const emailConfig = {
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  from: NORMALIZED_FROM,
  brandLogoUrl: process.env.EMAIL_BRAND_LOGO_URL ?? 'https://roogps.com/logo.png',
  appBaseUrl: (process.env.APP_BASE_URL ?? 'https://roogps.com').replace(/\/$/, ''),
} as const;

export function isEmailConfigured(): boolean {
  return !!emailConfig.resendApiKey && emailConfig.resendApiKey.length > 0;
}

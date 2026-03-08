import { Resend } from 'resend';
import { emailConfig, isEmailConfigured } from './emailConfig';

const resend = emailConfig.resendApiKey ? new Resend(emailConfig.resendApiKey) : null;

export type SendEmailOptions = {
  to: string | string[];
  subject: string;
  html: string;
  tags?: { name: string; value: string }[];
  replyTo?: string;
};

/**
 * Send a single email via Resend. No-op if RESEND_API_KEY is not set.
 * Failures are logged but not thrown so callers can continue.
 */
export async function sendEmail({
  to,
  subject,
  html,
  tags = [],
  replyTo,
}: SendEmailOptions): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!resend || !isEmailConfigured()) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('[email] RESEND_API_KEY not set – email skipped', { to, subject });
    }
    return { ok: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: emailConfig.from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      tags: tags.length > 0 ? tags : undefined,
      replyTo,
    });

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[email] Resend error', { error, to, subject });
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error('[email] Send failed', { message, to, subject });
    return { ok: false, error: message };
  }
}

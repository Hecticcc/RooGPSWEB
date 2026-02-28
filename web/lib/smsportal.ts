/**
 * SMSPortal REST API v3 – send SMS for GPS tracking alerts.
 * Ref: https://docs.smsportal.com/docs/api-keys, https://docs.smsportal.com/reference/bulkmessages_postv3
 */

const SMSPORTAL_BASE = process.env.SMSPORTAL_API_URL ?? 'https://rest.smsportal.com';
const SMSPORTAL_CLIENT_ID = process.env.SMSPORTAL_CLIENT_ID ?? '';
const SMSPORTAL_API_SECRET = process.env.SMSPORTAL_API_SECRET ?? '';
const SMSPORTAL_SENDER_ID = process.env.SMSPORTAL_SENDER_ID ?? 'RooGPS';

/** Normalize Australian number to E.164 (61 + 9 digits). */
export function toE164(mobile: string): string | null {
  const digits = mobile.replace(/\D/g, '');
  if (digits.length === 9 && digits.startsWith('4')) {
    return '61' + digits;
  }
  if (digits.length === 10 && digits.startsWith('04')) {
    return '61' + digits.slice(1);
  }
  if (digits.length === 11 && digits.startsWith('61')) {
    return digits;
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return digits.startsWith('0') ? null : digits;
  }
  return null;
}

/**
 * Send one SMS via SMSPortal POST /v3/BulkMessages.
 * Auth: Basic base64(ClientID:APISecret).
 * Returns true if sent, false if config missing or API error.
 */
export async function sendSms(destination: string, content: string): Promise<{ ok: boolean; error?: string }> {
  if (!SMSPORTAL_CLIENT_ID || !SMSPORTAL_API_SECRET) {
    return { ok: false, error: 'SMSPortal not configured' };
  }
  const to = toE164(destination) ?? destination.replace(/\D/g, '');
  if (!to || to.length < 10) {
    return { ok: false, error: 'Invalid destination' };
  }
  const auth = Buffer.from(`${SMSPORTAL_CLIENT_ID}:${SMSPORTAL_API_SECRET}`).toString('base64');
  const url = `${SMSPORTAL_BASE.replace(/\/$/, '')}/v3/BulkMessages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ destination: to, content: content.slice(0, 1600) }],
        sendOptions: { senderId: SMSPORTAL_SENDER_ID.slice(0, 11) },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `SMSPortal ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export const SMS_MONTHLY_LIMIT = 30;

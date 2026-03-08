import { createServiceRoleClient } from '@/lib/admin-auth';

/**
 * Check if we already sent this email (idempotency). Returns true if already sent.
 * After sending, call recordEmailSent to prevent duplicates.
 */
export async function wasEmailSent(eventName: string, idempotencyKey: string): Promise<boolean> {
  const admin = createServiceRoleClient();
  if (!admin) return false;
  const { data, error } = await admin
    .from('email_sent_log')
    .select('id')
    .eq('event_name', eventName)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

/**
 * Record that an email was sent so we don't send again for the same key.
 */
export async function recordEmailSent(
  eventName: string,
  idempotencyKey: string,
  recipientEmail: string | null
): Promise<void> {
  const admin = createServiceRoleClient();
  if (!admin) return;
  const { error } = await admin.from('email_sent_log').insert({
    event_name: eventName,
    idempotency_key: idempotencyKey,
    recipient_email: recipientEmail,
  });
  // Ignore unique violation (already sent)
  if (error && error.code !== '23505') {
    console.error('[email] recordEmailSent failed', error);
  }
}

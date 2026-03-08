import { createServiceRoleClient } from '@/lib/admin-auth';

/**
 * Get email for a user ID (from Supabase Auth). Returns null if not found or no email.
 */
export async function getEmailForUserId(userId: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  try {
    const { data: { user }, error } = await admin.auth.admin.getUserById(userId);
    if (error || !user?.email) return null;
    return user.email;
  } catch {
    return null;
  }
}

/**
 * Get display name for a user (profiles first_name/last_name or email).
 */
export async function getNameForUserId(userId: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data: profile } = await admin
    .from('profiles')
    .select('first_name, last_name')
    .eq('user_id', userId)
    .maybeSingle();
  if (profile && ((profile as { first_name?: string }).first_name || (profile as { last_name?: string }).last_name)) {
    const p = profile as { first_name?: string; last_name?: string };
    return [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || null;
  }
  return null;
}

/**
 * Get emails for all staff (staff_plus and administrator). Used for staff notifications.
 */
export async function getStaffNotificationEmails(): Promise<string[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data: roles } = await admin
    .from('user_roles')
    .select('user_id')
    .in('role', ['staff_plus', 'administrator']);
  if (!roles?.length) return [];
  const staffIds = Array.from(new Set((roles as { user_id: string }[]).map((r) => r.user_id)));
  const emails: string[] = [];
  for (const uid of staffIds) {
    const email = await getEmailForUserId(uid);
    if (email) emails.push(email);
  }
  return emails;
}

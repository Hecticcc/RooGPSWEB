import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createServiceRoleClient } from '@/lib/admin-auth';
import { hasMinRole } from '@/lib/roles';
import type { UserRole } from '@/lib/roles';

/**
 * Called by LoginForm after Supabase auth succeeds.
 * Returns { allowed: true } or { allowed: false, reason } so the client can
 * sign the user back out and show a message if logins are disabled.
 * Admins (staff_plus and above) are always allowed through.
 */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) return NextResponse.json({ allowed: true });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ allowed: false, reason: 'not_authenticated' });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ allowed: true }); // fail open

  const { data: settings } = await admin
    .from('system_settings')
    .select('login_disabled, maintenance_mode')
    .eq('id', 'default')
    .single();

  const blocked = settings?.login_disabled || settings?.maintenance_mode;
  if (!blocked) return NextResponse.json({ allowed: true });

  // Login disabled / maintenance — check if user has elevated role (staff_plus bypass)
  const { data: roleRow } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  const role = (roleRow?.role ?? 'customer') as UserRole;

  if (hasMinRole(role, 'staff_plus')) {
    return NextResponse.json({ allowed: true });
  }

  if (settings?.maintenance_mode) {
    return NextResponse.json({
      allowed: false,
      reason: 'maintenance_mode',
      message: 'System is under maintenance. Please try again later.',
    });
  }

  return NextResponse.json({
    allowed: false,
    reason: 'login_disabled',
    message: 'Logins are temporarily disabled. Please try again later.',
  });
}

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createServiceRoleClient } from '@/lib/admin-auth';
import type { UserRole } from '@/lib/roles';
import { hasMinRole } from '@/lib/roles';

export type SupportAuth = {
  userId: string;
  role: UserRole;
  isStaff: boolean;
};

export async function getSupportAuth(request: Request): Promise<
  | { ok: true; auth: SupportAuth; supabase: Awaited<ReturnType<typeof createServerSupabaseClient>> }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) {
    return { ok: false, response: NextResponse.json({ error: 'Server configuration error' }, { status: 503 }) };
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: row } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  const role = (row?.role ?? 'customer') as UserRole;
  const isStaff = hasMinRole(role, 'staff');
  return {
    ok: true,
    auth: { userId: user.id, role, isStaff },
    supabase,
  };
}

export function getServiceRoleClient() {
  return createServiceRoleClient();
}

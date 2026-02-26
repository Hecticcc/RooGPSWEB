import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import type { UserRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient(request);
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: row } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  const role = (row?.role ?? 'customer') as UserRole;

  return NextResponse.json({
    id: user.id,
    email: user.email ?? null,
    role,
  });
}

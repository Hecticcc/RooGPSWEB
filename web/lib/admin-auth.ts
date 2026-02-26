import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { hasMinRole, type UserRole } from '@/lib/roles';
import type { User } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Server-only. Creates a Supabase client with the service role key (bypasses RLS).
 * Use only in API routes; never expose this key to the client.
 */
export function createServiceRoleClient(): SupabaseClient | null {
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey);
}

export type RequireRoleResult =
  | { ok: true; user: User; role: UserRole; supabase: SupabaseClient }
  | { ok: false; status: number; body: { error: string } };

/**
 * Reusable role guard for API routes.
 * 1. Ensures the request is authenticated.
 * 2. Loads the user's role from user_roles.
 * 3. Ensures the user has at least minRole (by hierarchy).
 * Returns result with user, role, and anon supabase client, or error response.
 * For admin data (all users, all devices), use createServiceRoleClient() and pass it to your handler.
 */
export async function requireRole(
  request: Request | null,
  minRole: UserRole
): Promise<RequireRoleResult> {
  const supabase = await createServerSupabaseClient(request ?? undefined);
  if (!supabase) {
    return { ok: false, status: 503, body: { error: 'Server configuration error' } };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, body: { error: 'Unauthorized' } };
  }
  const { data: row } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  const role = (row?.role ?? 'customer') as UserRole;
  if (!hasMinRole(role, minRole)) {
    return { ok: false, status: 403, body: { error: 'Forbidden: insufficient role' } };
  }
  return { ok: true, user, role, supabase };
}

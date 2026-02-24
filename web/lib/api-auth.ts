import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Returns headers with the current session's access token so API routes can
 * authenticate the same user (avoids cookie/session sync issues with server).
 */
export async function getAuthHeaders(
  supabase: SupabaseClient
): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` };
  }
  return {};
}

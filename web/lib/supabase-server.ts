import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseProjectRef, filterCookiesForProject } from './supabase-cookies';

/**
 * Create Supabase client for API routes. Prefers Authorization: Bearer <token> from the request
 * so the server always sees the same session as the client (avoids cookie/session sync issues).
 * Falls back to cookie-based auth when no header is sent.
 */
export async function createServerSupabaseClient(request?: Request | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const authHeader = request?.headers?.get?.('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    return createSupabaseClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  }

  const cookieStore = await cookies();
  const projectRef = getSupabaseProjectRef();
  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          const all = cookieStore.getAll();
          const filtered = filterCookiesForProject(all, projectRef);
          return filtered.length ? filtered : all;
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}

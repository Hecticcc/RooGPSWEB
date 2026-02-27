import { createBrowserClient } from '@supabase/ssr';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const REMEMBER_ME_KEY = 'roogps_remember_me';

if (typeof window !== 'undefined' && (!url || !key)) {
  console.error(
    'Missing Supabase env: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your host (e.g. Netlify → Site settings → Environment variables), then redeploy.'
  );
}

/** Parse document.cookie into { name, value }[] for @supabase/ssr getAll. */
function getAllBrowserCookies(): { name: string; value: string }[] {
  if (typeof document === 'undefined') return [];
  return document.cookie
    .split('; ')
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf('=');
      const name = idx === -1 ? part.trim() : part.slice(0, idx).trim();
      const value = idx === -1 ? '' : part.slice(idx + 1).trim();
      return { name, value: decodeURIComponent(value || '') };
    });
}

/** Serialize one cookie for document.cookie. Omit maxAge for session cookie; maxAge 0 removes cookie. */
function setBrowserCookie(name: string, value: string, options?: { path?: string; maxAge?: number }) {
  if (typeof document === 'undefined') return;
  const path = options?.path ?? '/';
  if (value === '' || options?.maxAge === 0) {
    document.cookie = `${name}=; path=${path}; max-age=0`;
    return;
  }
  const encoded = encodeURIComponent(value);
  let s = `${name}=${encoded}; path=${path}`;
  if (options?.maxAge != null && options.maxAge > 0) {
    s += `; max-age=${options.maxAge}`;
  }
  document.cookie = s;
}

/**
 * Browser Supabase client. Uses cookie handling that respects "Remember me":
 * when roogps_remember_me is false (localStorage), auth cookies are session cookies;
 * when true, they persist (e.g. 30 days).
 */
export function createClient() {
  if (typeof window === 'undefined') {
    return createBrowserClient(url ?? '', key ?? '');
  }
  const THIRTY_DAYS = 60 * 60 * 24 * 30;
  return createBrowserClient(url ?? '', key ?? '', {
    cookies: {
      getAll() {
        return getAllBrowserCookies();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        const remember = localStorage.getItem(REMEMBER_ME_KEY) !== 'false';
        const maxAge = remember ? THIRTY_DAYS : undefined;
        cookiesToSet.forEach(({ name, value, options }) => {
          const empty = value == null || value === '';
          const remove = empty || options?.maxAge === 0;
          setBrowserCookie(name, value ?? '', {
            path: '/',
            ...(remove ? { maxAge: 0 } : maxAge !== undefined ? { maxAge } : {}),
          });
        });
      },
    },
  });
}
